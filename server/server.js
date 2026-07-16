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

const allowedOrigins = [process.env.CLIENT_URL, "http://localhost:5173", "http://localhost:3000"].filter(Boolean);
app.use(cors({ origin(origin, cb) { return !origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error(`CORS blocked origin: ${origin}`)); } }));
app.use(express.json({ limit: "8mb" }));
app.use("/generated", express.static(generatedDir));

const ratioSize = { "1:1": [1024, 1024], "16:9": [1280, 720], "9:16": [720, 1280] };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeText = (value = "") => String(value).replace(/[\\:'%,;]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

function deleteFileSafely(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); }
  catch (error) { console.error(`Cleanup failed for ${filePath}:`, error.message); }
}

function detectLanguage(story, selectedLanguage) {
  const text = String(story || "");
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (["English", "Hindi", "Hinglish"].includes(selectedLanguage)) return selectedLanguage;
  return "English";
}

function getVoice(language) {
  return language === "English" ? "en-IN-NeerjaNeural" : "hi-IN-SwaraNeural";
}

function getFontPath() {
  const candidates = process.platform === "win32"
    ? ["C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\Nirmala.ttf"]
    : ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"];
  const font = candidates.find(fs.existsSync);
  if (!font) throw new Error("Watermark font not found");
  return font.replace(/\\/g, "/").replace(":", "\\:");
}

async function checkCommand(command, args = ["-version"]) {
  try { await execFileAsync(command, args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024, windowsHide: true }); return true; }
  catch { return false; }
}

async function checkFFmpeg() {
  if (!(await checkCommand("ffmpeg"))) throw new Error("FFmpeg not found in PATH");
  if (!(await checkCommand("ffprobe"))) throw new Error("FFprobe not found in PATH");
}

let pythonCommand = null;
async function getPythonCommand() {
  if (pythonCommand) return pythonCommand;
  for (const command of process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"]) {
    try {
      const result = await execFileAsync(command, ["--version"], { timeout: 15000, windowsHide: true });
      pythonCommand = command;
      console.log(`Python detected: ${command} ${(result.stdout || result.stderr || "").trim()}`);
      return command;
    } catch {}
  }
  throw new Error("Python not found. Install Python and add it to PATH.");
}

async function checkEdgeTTS() {
  const python = await getPythonCommand();
  try {
    const result = await execFileAsync(python, ["-m", "edge_tts", "--list-voices"], { timeout: 120000, maxBuffer: 50 * 1024 * 1024, windowsHide: true });
    if (`${result.stdout || ""}${result.stderr || ""}`.trim().length < 50) throw new Error("Empty voice list");
    console.log("Edge TTS ready ✅");
  } catch (error) {
    const detail = error.stderr || error.stdout || error.message;
    throw new Error(String(detail).includes("No module named edge_tts") ? `${python} -m pip install --upgrade edge-tts` : `Edge TTS check failed: ${detail}`);
  }
}

async function getMediaDuration(filePath) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], { timeout: 30000, windowsHide: true });
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid media duration");
  return duration;
}

async function generateNarration({ text, language, outputPath }) {
  const python = await getPythonCommand();
  const voice = getVoice(language);
  const textPath = path.join(tempDir, `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(textPath, String(text || "").replace(/\s+/g, " ").trim().slice(0, 7000), "utf8");
  let lastError;
  try {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        deleteFileSafely(outputPath);
        console.log(`Edge TTS attempt ${attempt}/4...`);
        await execFileAsync(python, ["-m", "edge_tts", "--file", textPath, "--voice", voice, "--rate=-5%", "--volume=+10%", "--write-media", outputPath], { timeout: 360000, maxBuffer: 40 * 1024 * 1024, windowsHide: true });
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 2000) throw new Error("Invalid narration file");
        console.log(`Narration generated successfully on attempt ${attempt} ✅`);
        return;
      } catch (error) {
        lastError = error;
        console.error(`Edge TTS attempt ${attempt}/4 failed:`, String(error.stderr || error.stdout || error.message).trim());
        if (attempt < 4) await wait(attempt * 4000);
      }
    }
    throw new Error(`Voice generation failed after 4 attempts: ${lastError?.stderr || lastError?.stdout || lastError?.message}`);
  } finally { deleteFileSafely(textPath); }
}

function createScenePlan(story, duration) {
  const maxScenes = duration <= 15 ? 3 : duration <= 30 ? 5 : duration <= 45 ? 6 : duration <= 60 ? 8 : duration <= 90 ? 10 : 12;
  let sentences = String(story).replace(/\s+/g, " ").match(/[^.!?।]+[.!?।]?/g)?.map((s) => s.trim()).filter(Boolean) || [];
  if (sentences.length < 2) sentences = String(story).split(/,|और|\band\b/i).map((s) => s.trim()).filter(Boolean);
  if (sentences.length < 2) sentences = [`Opening scene based on ${story}`, "The main character begins the journey", "An important challenge appears", "A dramatic turning point occurs", "The story reaches a meaningful ending"];
  if (sentences.length <= maxScenes) return sentences;
  const groupSize = Math.ceil(sentences.length / maxScenes);
  return Array.from({ length: Math.ceil(sentences.length / groupSize) }, (_, i) => sentences.slice(i * groupSize, (i + 1) * groupSize).join(" ")).slice(0, maxScenes);
}

async function downloadSceneImage({ imageApiBase, prompt, imagePath, sceneNumber }) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      console.log(`Generating scene ${sceneNumber}, attempt ${attempt}/5...`);
      const seed = Math.floor(Math.random() * 999999);
      const url = `${imageApiBase}/${encodeURIComponent(prompt)}?width=720&height=1280&seed=${seed}&nologo=true&attempt=${attempt}`;
      const response = await fetch(url, { headers: { "User-Agent": "VisionCraft-AI/1.0", Accept: "image/*" }, signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) throw new Error(`Invalid content type: ${contentType}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 5000) throw new Error("Invalid downloaded image");
      fs.writeFileSync(imagePath, buffer);
      console.log(`Scene ${sceneNumber} image generated ✅`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`Scene ${sceneNumber} attempt ${attempt}/5 failed:`, error.message);
      if (attempt < 5) await wait(attempt * 2500);
    }
  }
  throw new Error(`Scene ${sceneNumber} image generation failed: ${lastError?.message}`);
}

app.get("/api/health", async (_, res) => {
  let ffmpegReady = false, edgeTTSReady = false, edgeTTSError = null;
  try { await checkFFmpeg(); ffmpegReady = true; } catch (error) { console.error(error.message); }
  try { await checkEdgeTTS(); edgeTTSReady = true; } catch (error) { edgeTTSError = error.message; }
  res.json({ success: ffmpegReady && edgeTTSReady, message: ffmpegReady && edgeTTSReady ? "VisionCraft AI API ready" : "Dependency check failed", ffmpegReady, edgeTTSReady, edgeTTSError, captionsEnabled: false, maxVideoDuration: 120, supportedLanguages: ["English", "Hindi", "Hinglish"] });
});

app.post("/api/images/generate", async (req, res) => {
  try {
    const { prompt, style = "Photorealistic", ratio = "1:1" } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ success: false, message: "Prompt is required" });
    const [width, height] = ratioSize[ratio] || ratioSize["1:1"];
    const enhancedPrompt = `${prompt.trim()}, ${style} style, professional composition, highly detailed, no text, no captions, no logo, no watermark`;
    const seed = Math.floor(Math.random() * 999999);
    const base = process.env.IMAGE_API_BASE || "https://image.pollinations.ai/prompt";
    const imageUrl = `${base}/${encodeURIComponent(enhancedPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    res.json({ success: true, id: `img_${Date.now()}`, prompt: prompt.trim(), enhancedPrompt, style, ratio, imageUrl, createdAt: new Date().toISOString() });
  } catch (error) { res.status(500).json({ success: false, message: error.message || "Image generation failed" }); }
});

app.post("/api/shorts/create", async (req, res) => {
  const id = `short_${Date.now()}`;
  const outputPath = path.join(generatedDir, `${id}.mp4`);
  const narrationPath = path.join(tempDir, `${id}_narration.mp3`);
  const temporaryFiles = [narrationPath];
  try {
    const { topic, duration = 30, watermark = "@VISHAL619", style = "Cinematic", language: selectedLanguage = "English" } = req.body;
    if (!topic?.trim()) return res.status(400).json({ success: false, message: "Please enter a complete story" });
    await checkFFmpeg(); await checkEdgeTTS();
    const seconds = Math.min(120, Math.max(5, Number(duration) || 30));
    const language = detectLanguage(topic, selectedLanguage);
    const voice = getVoice(language);
    const mark = safeText(watermark) || "@VISHAL619";
    const fontPath = getFontPath();
    console.log("==============================");
    console.log(`Video ID: ${id}\nDuration: ${seconds}s\nLanguage: ${language}\nVoice: ${voice}\nWords: ${String(topic).trim().split(/\s+/).length}`);
    console.log("==============================");
    console.log(`Generating ${language} narration using ${voice}...`);
    await generateNarration({ text: topic, language, outputPath: narrationPath });
    const narrationDuration = await getMediaDuration(narrationPath);
    console.log(`Narration duration: ${narrationDuration.toFixed(2)} seconds`);
    if (narrationDuration < Math.max(5, seconds * 0.5)) return res.status(400).json({ success: false, code: "STORY_TOO_SHORT", message: `Narration is only ${Math.round(narrationDuration)} seconds. Please enter a longer story for a ${seconds}-second video.` });

    const scenes = createScenePlan(topic, seconds);
    const sceneDuration = seconds / scenes.length;
    const frames = Math.max(30, Math.round(sceneDuration * 30));
    const base = process.env.IMAGE_API_BASE || "https://image.pollinations.ai/prompt";
    const publicBase = `${req.protocol}://${req.get("host")}`;
    const clipPaths = [], sceneData = [];
    console.log(`Creating ${scenes.length} scenes`);

    for (let index = 0; index < scenes.length; index += 1) {
      const sceneNumber = index + 1;
      const sceneText = scenes[index];
      const prompt = `Scene ${sceneNumber}: ${sceneText}. Full story: ${topic}. Keep the same main character face, age, clothes, hairstyle, body appearance, environment and art direction in every scene. ${style} vertical animated movie frame, expressive characters, cinematic lighting, professional composition, highly detailed, no text, no captions, no subtitles, no logo, no watermark.`;
      const imagePath = path.join(generatedDir, `${id}_scene_${sceneNumber}.jpg`);
      const clipPath = path.join(tempDir, `${id}_clip_${sceneNumber}.mp4`);
      temporaryFiles.push(clipPath);
      await downloadSceneImage({ imageApiBase: base, prompt, imagePath, sceneNumber });
      if (index < scenes.length - 1) await wait(1200);
      const fadeOut = Math.max(0.4, sceneDuration - 0.45).toFixed(2);
      const motion = index % 2 === 0
        ? `zoompan=z='min(zoom+0.0012,1.16)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=30`
        : `zoompan=z='if(lte(zoom,1.0),1.16,max(1.001,zoom-0.0012))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=30`;
      const filters = ["scale=900:1600:force_original_aspect_ratio=increase", "crop=900:1600", motion, "fade=t=in:st=0:d=0.35", `fade=t=out:st=${fadeOut}:d=0.35`, `drawtext=fontfile='${fontPath}':text='${mark}':fontcolor=white@0.92:fontsize=24:x=main_w-text_w-32:y=32:box=1:boxcolor=black@0.30:boxborderw=7`, "format=yuv420p"].join(",");
      console.log(`Rendering scene ${sceneNumber}/${scenes.length}...`);
      await execFileAsync("ffmpeg", ["-y", "-loop", "1", "-i", imagePath, "-vf", filters, "-t", String(sceneDuration), "-r", "30", "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", clipPath], { timeout: 300000, maxBuffer: 40 * 1024 * 1024, windowsHide: true });
      clipPaths.push(clipPath);
      sceneData.push({ number: sceneNumber, text: sceneText, imageUrl: `${publicBase}/generated/${path.basename(imagePath)}` });
    }

    const concatPath = path.join(tempDir, `${id}_concat.txt`);
    temporaryFiles.push(concatPath);
    fs.writeFileSync(concatPath, clipPaths.map((clip) => `file '${clip.replace(/\\/g, "/")}'`).join("\n"), "utf8");
    const tempo = Math.min(2, Math.max(0.5, narrationDuration / seconds));
    console.log(`Combining video and narration...\nAudio tempo ratio: ${tempo.toFixed(4)}`);
    await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-i", narrationPath, "-filter_complex", `[1:a]atempo=${tempo.toFixed(4)},volume=1.4,apad=whole_dur=${seconds}[voice]`, "-map", "0:v:0", "-map", "[voice]", "-t", String(seconds), "-r", "30", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-movflags", "+faststart", outputPath], { timeout: 900000, maxBuffer: 60 * 1024 * 1024, windowsHide: true });
    const finalDuration = await getMediaDuration(outputPath);
    console.log(`Video created successfully: ${id}.mp4 ✅`);
    res.json({ success: true, id, videoUrl: `${publicBase}/generated/${id}.mp4`, duration: Number(finalDuration.toFixed(2)), selectedDuration: seconds, originalNarrationDuration: Number(narrationDuration.toFixed(2)), language, voice, watermark: mark, captionsEnabled: false, sceneCount: sceneData.length, scenes: sceneData, hasAudio: true, createdAt: new Date().toISOString() });
  } catch (error) {
    console.error("Story video generation error:", error.stderr || error.stdout || error.message || error);
    deleteFileSafely(outputPath);
    res.status(500).json({ success: false, message: String(error.stderr || error.stdout || error.message || "Story video rendering failed").trim() });
  } finally { temporaryFiles.forEach(deleteFileSafely); }
});

app.use((req, res) => res.status(404).json({ success: false, message: "VisionCraft AI route not found" }));
app.use((error, req, res, next) => res.status(500).json({ success: false, message: error.message || "Internal server error" }));

async function startServer() {
  console.log("Checking VisionCraft AI dependencies...");
  try { await checkFFmpeg(); console.log("FFmpeg ready ✅\nFFprobe ready ✅"); } catch (error) { console.error(`FFmpeg check failed: ${error.message}`); }
  try { await checkEdgeTTS(); } catch (error) { console.error(`Edge TTS check failed: ${error.message}`); }
  app.listen(PORT, () => console.log(`VisionCraft AI server running on http://localhost:${PORT}\nHealth check: http://localhost:${PORT}/api/health\nMaximum video duration: 120 seconds\nCaptions: Disabled\nLanguages: English, Hindi, Hinglish`));
}
startServer();
