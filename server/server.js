require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 5000;

const generatedDir = path.join(__dirname, "generated");
const tempDir = path.join(__dirname, "temp");
[generatedDir, tempDir].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      return !origin || allowedOrigins.includes(origin)
        ? callback(null, true)
        : callback(new Error(`CORS blocked origin: ${origin}`));
    },
  })
);
app.use(express.json({ limit: "8mb" }));
app.use("/generated", express.static(generatedDir, { maxAge: "1h" }));

const jobs = new Map();
const ratioSize = {
  "1:1": [1024, 1024],
  "16:9": [1280, 720],
  "9:16": [720, 1280],
};

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const safeWatermark = (value = "") =>
  String(value)
    .replace(/[\\:'%,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);

function deleteFileSafely(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.error(`Cleanup failed for ${filePath}:`, error.message);
  }
}

function cleanOldGeneratedFiles() {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const directory of [generatedDir, tempDir]) {
    for (const name of fs.readdirSync(directory)) {
      const filePath = path.join(directory, name);
      try {
        if (fs.statSync(filePath).mtimeMs < cutoff) deleteFileSafely(filePath);
      } catch {}
    }
  }

  for (const [jobId, job] of jobs.entries()) {
    if (new Date(job.updatedAt).getTime() < cutoff) jobs.delete(jobId);
  }
}

setInterval(cleanOldGeneratedFiles, 30 * 60 * 1000).unref();

function updateJob(jobId, patch) {
  const current = jobs.get(jobId);
  if (!current) return;
  jobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function detectLanguage(story, selectedLanguage) {
  const text = String(story || "");
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (["English", "Hindi", "Hinglish"].includes(selectedLanguage)) {
    return selectedLanguage;
  }
  return "English";
}

function getVoice(language, gender = "Female") {
  const male = String(gender).toLowerCase() === "male";
  if (language === "English") {
    return male ? "en-IN-PrabhatNeural" : "en-IN-NeerjaNeural";
  }
  return male ? "hi-IN-MadhurNeural" : "hi-IN-SwaraNeural";
}

function getFontPath() {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Windows\\Fonts\\Nirmala.ttf",
          "C:\\Windows\\Fonts\\arial.ttf",
        ]
      : [
          "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
          "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
          "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ];

  const font = candidates.find(fs.existsSync);
  if (!font) throw new Error("Required subtitle font was not found");
  return escapeFilterPath(font);
}

function escapeFilterPath(filePath) {
  return path
    .resolve(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function wrapCaption(text, maxCharacters = 34) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3).join("\n");
}

async function checkCommand(command, args = ["-version"]) {
  try {
    await execFileAsync(command, args, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function checkFFmpeg() {
  if (!(await checkCommand("ffmpeg"))) {
    throw new Error("FFmpeg not found in PATH");
  }
  if (!(await checkCommand("ffprobe"))) {
    throw new Error("FFprobe not found in PATH");
  }
}

let pythonCommand = null;
async function getPythonCommand() {
  if (pythonCommand) return pythonCommand;
  const commands =
    process.platform === "win32"
      ? ["py", "python", "python3"]
      : ["python3", "python"];

  for (const command of commands) {
    try {
      const result = await execFileAsync(command, ["--version"], {
        timeout: 15000,
        windowsHide: true,
      });
      pythonCommand = command;
      console.log(
        `Python detected: ${command} ${(
          result.stdout ||
          result.stderr ||
          ""
        ).trim()}`
      );
      return command;
    } catch {}
  }
  throw new Error("Python not found. Install Python and add it to PATH.");
}

async function checkEdgeTTS() {
  const python = await getPythonCommand();
  try {
    const result = await execFileAsync(
      python,
      ["-m", "edge_tts", "--list-voices"],
      {
        timeout: 120000,
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true,
      }
    );
    if (`${result.stdout || ""}${result.stderr || ""}`.trim().length < 50) {
      throw new Error("Empty voice list");
    }
  } catch (error) {
    const detail = error.stderr || error.stdout || error.message;
    throw new Error(
      String(detail).includes("No module named edge_tts")
        ? `${python} -m pip install --upgrade edge-tts`
        : `Edge TTS check failed: ${detail}`
    );
  }
}

async function getMediaDuration(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { timeout: 30000, windowsHide: true }
  );
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Invalid media duration");
  }
  return duration;
}

async function generateNarration({
  text,
  language,
  gender,
  rate,
  outputPath,
}) {
  const python = await getPythonCommand();
  const voice = getVoice(language, gender);
  const textPath = path.join(
    tempDir,
    `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`
  );
  fs.writeFileSync(
    textPath,
    String(text || "").replace(/\s+/g, " ").trim().slice(0, 7000),
    "utf8"
  );
  const normalizedRate = Math.max(-20, Math.min(20, Number(rate) || 0));
  const rateValue = `${normalizedRate >= 0 ? "+" : ""}${normalizedRate}%`;
  let lastError;

  try {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        deleteFileSafely(outputPath);
        await execFileAsync(
          python,
          [
            "-m",
            "edge_tts",
            "--file",
            textPath,
            "--voice",
            voice,
            `--rate=${rateValue}`,
            "--volume=+8%",
            "--write-media",
            outputPath,
          ],
          {
            timeout: 360000,
            maxBuffer: 40 * 1024 * 1024,
            windowsHide: true,
          }
        );
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 2000) {
          throw new Error("Invalid narration file");
        }
        return voice;
      } catch (error) {
        lastError = error;
        if (attempt < 4) await wait(attempt * 4000);
      }
    }
    throw new Error(
      `Voice generation failed: ${
        lastError?.stderr || lastError?.stdout || lastError?.message
      }`
    );
  } finally {
    deleteFileSafely(textPath);
  }
}

function createScenePlan(story, duration) {
  const maxScenes =
    duration <= 15
      ? 3
      : duration <= 30
      ? 4
      : duration <= 45
      ? 5
      : duration <= 60
      ? 6
      : duration <= 90
      ? 7
      : 8;

  let sentences =
    String(story)
      .replace(/\s+/g, " ")
      .match(/[^.!?।]+[.!?।]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) || [];

  if (sentences.length < 2) {
    sentences = String(story)
      .split(/,|और|\band\b/i)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  }

  if (sentences.length < 2) {
    sentences = [
      `Opening scene based on ${story}`,
      "The main character begins the journey",
      "An important challenge appears",
      "A dramatic turning point occurs",
      "The story reaches a meaningful ending",
    ];
  }

  if (sentences.length <= maxScenes) return sentences;
  const groupSize = Math.ceil(sentences.length / maxScenes);
  return Array.from(
    { length: Math.ceil(sentences.length / groupSize) },
    (_, index) =>
      sentences
        .slice(index * groupSize, (index + 1) * groupSize)
        .join(" ")
  ).slice(0, maxScenes);
}

async function downloadSceneImage({
  imageApiBase,
  prompt,
  imagePath,
  sceneNumber,
  frameNumber,
  seed,
  width,
  height,
}) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const url =
        `${imageApiBase}/${encodeURIComponent(prompt)}` +
        `?width=${width}&height=${height}&seed=${seed}&nologo=true&attempt=${attempt}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "VisionCraft-AI/2.0",
          Accept: "image/*",
        },
        signal: AbortSignal.timeout(150000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        throw new Error(`Invalid content type: ${contentType}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 5000) throw new Error("Invalid downloaded image");
      fs.writeFileSync(imagePath, buffer);
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `Scene ${sceneNumber} frame ${frameNumber}, attempt ${attempt}/5 failed:`,
        error.message
      );
      if (attempt < 5) await wait(attempt * 2500);
    }
  }
  throw new Error(
    `Scene ${sceneNumber} frame ${frameNumber} failed: ${lastError?.message}`
  );
}

function buildMotionFilter({
  frames,
  width,
  height,
  direction,
  intensity,
}) {
  const zoomStep = intensity === "High" ? 0.0016 : intensity === "Low" ? 0.0007 : 0.0011;
  const startZoom = direction % 2 === 0 ? "1.0" : "1.14";
  const zoom =
    direction % 2 === 0
      ? `min(zoom+${zoomStep},1.16)`
      : `if(lte(zoom,1.0),${startZoom},max(1.001,zoom-${zoomStep}))`;
  const x =
    direction % 3 === 0
      ? "iw/2-(iw/zoom/2)"
      : direction % 3 === 1
      ? "min(iw-iw/zoom,on*1.2)"
      : "max(0,iw-iw/zoom-on*1.2)";
  const y = "ih/2-(ih/zoom/2)";
  return `zoompan=z='${zoom}':x='${x}':y='${y}':d=${frames}:s=${width}x${height}:fps=30`;
}

function atempoChain(ratio) {
  let remaining = ratio;
  const filters = [];
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(",");
}

function getMusicSource(music, duration) {
  const seconds = Number(duration).toFixed(2);
  if (music === "Calm Ambient") {
    return `aevalsrc=0.055*sin(2*PI*130.81*t)+0.035*sin(2*PI*196*t)+0.02*sin(2*PI*261.63*t):s=44100:d=${seconds}`;
  }
  if (music === "Uplifting") {
    return `aevalsrc=0.05*sin(2*PI*164.81*t)+0.04*sin(2*PI*246.94*t)+0.025*sin(2*PI*329.63*t):s=44100:d=${seconds}`;
  }
  return `aevalsrc=0.06*sin(2*PI*92.5*t)+0.035*sin(2*PI*138.59*t)+0.018*sin(2*PI*185*t):s=44100:d=${seconds}`;
}

async function renderStoryVideo(jobId, payload, publicBase) {
  const id = jobId;
  const outputPath = path.join(generatedDir, `${id}.mp4`);
  const narrationPath = path.join(tempDir, `${id}_narration.mp3`);
  const temporaryFiles = [narrationPath];

  try {
    const {
      topic,
      duration = 30,
      watermark = "@VISHAL619",
      style = "Cinematic",
      language: selectedLanguage = "English",
      voiceGender = "Female",
      voiceRate = 0,
      music = "Cinematic Pulse",
      subtitles = true,
      animationIntensity = "Medium",
      quality = "720p",
    } = payload;

    await checkFFmpeg();
    await checkEdgeTTS();
    const seconds = Math.min(120, Math.max(5, Number(duration) || 30));
    const language = detectLanguage(topic, selectedLanguage);
    const mark = safeWatermark(watermark) || "@VISHAL619";
    const fontPath = getFontPath();
    const width = quality === "1080p" ? 1080 : 720;
    const height = quality === "1080p" ? 1920 : 1280;
    const imageWidth = quality === "1080p" ? 1080 : 720;
    const imageHeight = quality === "1080p" ? 1920 : 1280;

    updateJob(jobId, {
      stage: "voice",
      progress: 8,
      message: "Creating neural narration...",
    });
    const voice = await generateNarration({
      text: topic,
      language,
      gender: voiceGender,
      rate: voiceRate,
      outputPath: narrationPath,
    });
    const narrationDuration = await getMediaDuration(narrationPath);

    const scenes = createScenePlan(topic, seconds);
    const sceneDuration = seconds / scenes.length;
    const base =
      process.env.IMAGE_API_BASE || "https://image.pollinations.ai/prompt";
    const clipPaths = [];
    const sceneData = [];
    const characterSeed = Math.floor(Math.random() * 800000) + 100000;

    for (let index = 0; index < scenes.length; index += 1) {
      const sceneNumber = index + 1;
      const sceneText = scenes[index];
      const sceneProgressStart = 15 + Math.round((index / scenes.length) * 62);
      const sceneSeed = characterSeed + sceneNumber * 101;
      const imagePaths = [];

      updateJob(jobId, {
        stage: "scenes",
        progress: sceneProgressStart,
        message: `Generating animated scene ${sceneNumber} of ${scenes.length}...`,
        currentScene: sceneNumber,
        totalScenes: scenes.length,
      });

      for (let frameIndex = 0; frameIndex < 2; frameIndex += 1) {
        const frameNumber = frameIndex + 1;
        const imagePath = path.join(
          generatedDir,
          `${id}_scene_${sceneNumber}_frame_${frameNumber}.jpg`
        );
        const action =
          frameNumber === 1
            ? "opening keyframe, action is beginning"
            : "continuation keyframe, visible movement and action progression";
        const visualPrompt = [
          `Animated story scene ${sceneNumber}, ${action}: ${sceneText}.`,
          `Complete story context: ${topic}.`,
          "CHARACTER LOCK: preserve the exact same main character identity, face, age, hairstyle, body proportions, clothing colors and accessories in every frame and scene.",
          `${style} vertical animated movie frame, dynamic pose, expressive emotion, cinematic depth, professional lighting, detailed environment, strong foreground and background separation.`,
          "No text, no captions, no subtitles, no logo and no watermark.",
        ].join(" ");

        await downloadSceneImage({
          imageApiBase: base,
          prompt: visualPrompt,
          imagePath,
          sceneNumber,
          frameNumber,
          seed: sceneSeed,
          width: imageWidth,
          height: imageHeight,
        });
        imagePaths.push(imagePath);
        if (frameIndex === 0) await wait(900);
      }

      const keyTransition = Math.min(0.65, Math.max(0.35, sceneDuration * 0.12));
      const keyDuration = (sceneDuration + keyTransition) / 2;
      const keyFrames = Math.max(30, Math.round(keyDuration * 30));
      const frameClipPaths = [];

      for (let frameIndex = 0; frameIndex < imagePaths.length; frameIndex += 1) {
        const frameClip = path.join(
          tempDir,
          `${id}_scene_${sceneNumber}_motion_${frameIndex + 1}.mp4`
        );
        temporaryFiles.push(frameClip);
        const motion = buildMotionFilter({
          frames: keyFrames,
          width,
          height,
          direction: index * 2 + frameIndex,
          intensity: animationIntensity,
        });
        const videoFilter = [
          `scale=${Math.round(width * 1.25)}:${Math.round(
            height * 1.25
          )}:force_original_aspect_ratio=increase`,
          `crop=${Math.round(width * 1.25)}:${Math.round(height * 1.25)}`,
          motion,
          "eq=saturation=1.05:contrast=1.03",
          "format=yuv420p",
        ].join(",");

        await execFileAsync(
          "ffmpeg",
          [
            "-y",
            "-loop",
            "1",
            "-i",
            imagePaths[frameIndex],
            "-vf",
            videoFilter,
            "-t",
            String(keyDuration),
            "-r",
            "30",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            frameClip,
          ],
          {
            timeout: 360000,
            maxBuffer: 50 * 1024 * 1024,
            windowsHide: true,
          }
        );
        frameClipPaths.push(frameClip);
      }

      const captionPath = path.join(tempDir, `${id}_caption_${sceneNumber}.txt`);
      fs.writeFileSync(captionPath, wrapCaption(sceneText), "utf8");
      temporaryFiles.push(captionPath);
      const sceneClip = path.join(tempDir, `${id}_clip_${sceneNumber}.mp4`);
      temporaryFiles.push(sceneClip);

      const overlayFilters = [
        `[0:v][1:v]xfade=transition=fade:duration=${keyTransition.toFixed(
          2
        )}:offset=${(keyDuration - keyTransition).toFixed(2)}`,
        "fade=t=in:st=0:d=0.18",
        `fade=t=out:st=${Math.max(0.2, sceneDuration - 0.22).toFixed(
          2
        )}:d=0.22`,
        `drawtext=fontfile='${fontPath}':text='${mark}':fontcolor=white@0.92:fontsize=${
          quality === "1080p" ? 34 : 24
        }:x=main_w-text_w-32:y=32:box=1:boxcolor=black@0.30:boxborderw=7`,
      ];

      if (subtitles) {
        overlayFilters.push(
          `drawbox=x=32:y=ih-${quality === "1080p" ? 360 : 250}:w=iw-64:h=${
            quality === "1080p" ? 250 : 175
          }:color=black@0.52:t=fill`,
          `drawtext=fontfile='${fontPath}':textfile='${escapeFilterPath(
            captionPath
          )}':fontcolor=white:fontsize=${
            quality === "1080p" ? 45 : 31
          }:line_spacing=8:x=(main_w-text_w)/2:y=main_h-${
            quality === "1080p" ? 315 : 215
          }:fix_bounds=true`
        );
      }
      overlayFilters.push("format=yuv420p[v]");

      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-i",
          frameClipPaths[0],
          "-i",
          frameClipPaths[1],
          "-filter_complex",
          overlayFilters.join(","),
          "-map",
          "[v]",
          "-t",
          String(sceneDuration),
          "-r",
          "30",
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          sceneClip,
        ],
        {
          timeout: 420000,
          maxBuffer: 60 * 1024 * 1024,
          windowsHide: true,
        }
      );

      clipPaths.push(sceneClip);
      sceneData.push({
        number: sceneNumber,
        text: sceneText,
        imageUrl: `${publicBase}/generated/${path.basename(imagePaths[0])}`,
        keyframes: imagePaths.map(
          (imagePath) =>
            `${publicBase}/generated/${path.basename(imagePath)}`
        ),
      });
    }

    updateJob(jobId, {
      stage: "finalizing",
      progress: 82,
      message: "Combining scenes, voice and background music...",
    });

    const concatPath = path.join(tempDir, `${id}_concat.txt`);
    temporaryFiles.push(concatPath);
    fs.writeFileSync(
      concatPath,
      clipPaths
        .map((clip) => `file '${clip.replace(/\\/g, "/")}'`)
        .join("\n"),
      "utf8"
    );

    const tempo = narrationDuration / seconds;
    const voiceFilter = `${atempoChain(tempo)},volume=1.28`;
    const ffmpegArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-i",
      narrationPath,
    ];

    let audioFilter;
    if (music === "None") {
      audioFilter = `[1:a]${voiceFilter},apad=whole_dur=${seconds}[audio]`;
    } else {
      ffmpegArgs.push(
        "-f",
        "lavfi",
        "-i",
        getMusicSource(music, seconds)
      );
      audioFilter = [
        `[1:a]${voiceFilter},apad=whole_dur=${seconds}[voice]`,
        `[2:a]volume=0.16,afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(
          0,
          seconds - 1.3
        ).toFixed(2)}:d=1.3[music]`,
        "[voice][music]amix=inputs=2:duration=first:dropout_transition=2,alimiter=limit=0.95[audio]",
      ].join(";");
    }

    ffmpegArgs.push(
      "-filter_complex",
      audioFilter,
      "-map",
      "0:v:0",
      "-map",
      "[audio]",
      "-t",
      String(seconds),
      "-r",
      "30",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ar",
      "44100",
      "-movflags",
      "+faststart",
      outputPath
    );

    await execFileAsync("ffmpeg", ffmpegArgs, {
      timeout: 1200000,
      maxBuffer: 80 * 1024 * 1024,
      windowsHide: true,
    });

    const finalDuration = await getMediaDuration(outputPath);
    updateJob(jobId, {
      status: "completed",
      stage: "completed",
      progress: 100,
      message: "Your animated story is ready!",
      result: {
        success: true,
        id,
        videoUrl: `${publicBase}/generated/${id}.mp4`,
        duration: Number(finalDuration.toFixed(2)),
        selectedDuration: seconds,
        originalNarrationDuration: Number(narrationDuration.toFixed(2)),
        language,
        voice,
        voiceGender,
        music,
        subtitles,
        animationIntensity,
        quality,
        watermark: mark,
        sceneCount: sceneData.length,
        keyframeCount: sceneData.length * 2,
        scenes: sceneData,
        hasAudio: true,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(
      "Story video generation error:",
      error.stderr || error.stdout || error.message || error
    );
    deleteFileSafely(outputPath);
    updateJob(jobId, {
      status: "failed",
      stage: "failed",
      message: String(
        error.stderr ||
          error.stdout ||
          error.message ||
          "Story video rendering failed"
      ).trim(),
    });
  } finally {
    temporaryFiles.forEach(deleteFileSafely);
  }
}

app.get("/api/health", async (_, res) => {
  let ffmpegReady = false;
  let edgeTTSReady = false;
  let edgeTTSError = null;
  try {
    await checkFFmpeg();
    ffmpegReady = true;
  } catch (error) {
    console.error(error.message);
  }
  try {
    await checkEdgeTTS();
    edgeTTSReady = true;
  } catch (error) {
    edgeTTSError = error.message;
  }
  res.json({
    success: ffmpegReady && edgeTTSReady,
    message:
      ffmpegReady && edgeTTSReady
        ? "VisionCraft AI 2.0 API ready"
        : "Dependency check failed",
    ffmpegReady,
    edgeTTSReady,
    edgeTTSError,
    animationEngine: "2.0",
    captionsEnabled: true,
    backgroundMusicEnabled: true,
    asyncJobsEnabled: true,
    maxVideoDuration: 120,
    supportedLanguages: ["English", "Hindi", "Hinglish"],
  });
});

app.post("/api/images/generate", async (req, res) => {
  try {
    const {
      prompt,
      style = "Photorealistic",
      ratio = "1:1",
    } = req.body;
    if (!prompt?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Prompt is required" });
    }
    const [width, height] = ratioSize[ratio] || ratioSize["1:1"];
    const enhancedPrompt = `${prompt.trim()}, ${style} style, professional composition, highly detailed, no text, no captions, no logo, no watermark`;
    const seed = Math.floor(Math.random() * 999999);
    const base =
      process.env.IMAGE_API_BASE || "https://image.pollinations.ai/prompt";
    const imageUrl = `${base}/${encodeURIComponent(
      enhancedPrompt
    )}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    res.json({
      success: true,
      id: `img_${Date.now()}`,
      prompt: prompt.trim(),
      enhancedPrompt,
      style,
      ratio,
      imageUrl,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Image generation failed",
    });
  }
});

app.post("/api/shorts/create", (req, res) => {
  const topic = req.body?.topic;
  if (!topic?.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Please enter a complete story" });
  }

  const id = `short_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const publicBase = `${req.protocol}://${req.get("host")}`;
  const createdAt = new Date().toISOString();
  jobs.set(id, {
    id,
    status: "queued",
    stage: "planning",
    progress: 2,
    message: "Planning your animated story...",
    createdAt,
    updatedAt: createdAt,
  });

  setImmediate(() => {
    updateJob(id, {
      status: "processing",
      progress: 4,
      message: "Preparing AI animation engine...",
    });
    renderStoryVideo(id, req.body, publicBase);
  });

  return res.status(202).json({
    success: true,
    jobId: id,
    status: "queued",
    statusUrl: `${publicBase}/api/jobs/${id}`,
    message: "Story video generation started",
  });
});

app.get("/api/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Video job was not found or has expired",
    });
  }
  return res.json({ success: true, ...job });
});

app.use((req, res) =>
  res.status(404).json({
    success: false,
    message: "VisionCraft AI route not found",
  })
);

app.use((error, req, res, next) =>
  res.status(500).json({
    success: false,
    message: error.message || "Internal server error",
  })
);

async function startServer() {
  console.log("Checking VisionCraft AI 2.0 dependencies...");
  try {
    await checkFFmpeg();
    console.log("FFmpeg ready ✅\nFFprobe ready ✅");
  } catch (error) {
    console.error(`FFmpeg check failed: ${error.message}`);
  }
  try {
    await checkEdgeTTS();
    console.log("Edge TTS ready ✅");
  } catch (error) {
    console.error(`Edge TTS check failed: ${error.message}`);
  }
  cleanOldGeneratedFiles();
  app.listen(PORT, "0.0.0.0", () =>
    console.log(`VisionCraft AI 2.0 server running on port ${PORT}`)
  );
}

startServer();
