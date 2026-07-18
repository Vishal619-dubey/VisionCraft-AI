import { useEffect, useRef, useState } from "react";
import {
  Bell, Camera, ChevronDown, Clock3, Download, Film, FolderHeart,
  History, Image, LayoutGrid, LoaderCircle, Menu, Play, Search,
  Settings, Sparkles, WandSparkles, X, Zap, Volume2, Music2,
  Captions, CheckCircle2, Circle, ExternalLink, Trash2
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const styles = ["Photorealistic", "Cinematic", "3D Render", "Anime", "Digital Art", "Minimal"];
const durations = [15, 30, 45, 60, 90, 120];

function Sidebar({ page, setPage, open, setOpen, profileImage }) {
  const items = [
    ["studio", WandSparkles, "Create Image"], ["shorts", Film, "Shorts Studio"],
    ["gallery", LayoutGrid, "My Creations"], ["favorites", FolderHeart, "Favorites"],
    ["history", History, "History"]
  ];
  return <aside className={`sidebar ${open ? "open" : ""}`}>
    <div className="brand"><span className="brandmark vc-logo"><Sparkles /><i className="orbit-one"/><i className="orbit-two"/></span><span>VisionCraft <b>AI</b></span></div>
    <button className="close-mobile" onClick={() => setOpen(false)}><X /></button>
    <div className="workspace"><div className="avatar">{profileImage?<img src={profileImage} alt="Vishal Dubey"/>:"VD"}</div><div><strong>Vishal's Studio</strong><small>AI animation workspace</small></div><ChevronDown size={16}/></div>
    <p className="nav-label">CREATIVE TOOLS</p>
    <nav>{items.map(([id, Icon, label]) => <button key={id} className={page===id?"active":""} onClick={()=>{setPage(id);setOpen(false)}}><Icon size={20}/><span>{label}</span>{id==="shorts"&&<em>NEW</em>}</button>)}</nav>
    <div className="sidebar-bottom"><button><Settings size={20}/>Settings</button><div className="credits"><div><Sparkles size={17}/><strong>Free Studio</strong></div><span>Unlimited local video renders</span><i><b style={{width:"78%"}} /></i></div></div>
  </aside>
}

function Header({ setOpen, profileImage, setProfileImage, notify }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const fileRef = useRef(null);

  function selectProfilePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Please select an image file");
    if (file.size > 3 * 1024 * 1024) return notify("Profile image must be under 3 MB");
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      setProfileImage(value);
      localStorage.setItem("visioncraft-profile-image", value);
      setProfileOpen(false);
      notify("Profile photo updated");
    };
    reader.readAsDataURL(file);
  }

  function removeProfilePhoto() {
    setProfileImage("");
    localStorage.removeItem("visioncraft-profile-image");
    setProfileOpen(false);
    notify("Profile photo removed");
  }

  return <header>
    <button className="mobile-menu" onClick={()=>setOpen(true)}><Menu/></button>
    <div className="search"><Search size={18}/><input placeholder="Search creations or prompts..."/><kbd>⌘ K</kbd></div>
    <div className="header-actions">
      <button className="upgrade"><Zap size={16}/>Portfolio workspace</button>
      <button className="icon-btn" aria-label="Notifications"><Bell size={19}/><i/></button>
      <div className="profile-wrap">
        <button className="profile" onClick={()=>setProfileOpen(v=>!v)} aria-label="Open profile menu">
          <div className="profile-img">{profileImage?<img src={profileImage} alt="Vishal Dubey"/>:"VD"}</div>
          <div><strong>Vishal Dubey</strong><small>Full Stack Developer</small></div><ChevronDown size={15}/>
        </button>
        {profileOpen&&<div className="profile-menu">
          <div className="profile-menu-head"><div className="profile-img large">{profileImage?<img src={profileImage} alt="Vishal Dubey"/>:"VD"}</div><div><strong>Vishal Dubey</strong><span>VisionCraft AI Creator</span></div></div>
          <button onClick={()=>fileRef.current?.click()}><Camera size={16}/>{profileImage?"Change profile photo":"Add profile photo"}</button>
          {profileImage&&<button onClick={removeProfilePhoto}><X size={16}/>Remove photo</button>}
          <a href="https://github.com/Vishal619-dubey" target="_blank" rel="noreferrer"><ExternalLink size={16}/>GitHub profile</a>
          <a href="https://www.linkedin.com/in/vishal-dubey-ai/" target="_blank" rel="noreferrer"><ExternalLink size={16}/>LinkedIn profile</a>
          <div className="profile-menu-note">Portfolio identity • VisionCraft AI 2.0</div>
        </div>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={selectProfilePhoto}/>
      </div>
    </div>
  </header>
}

function ImageStudio({ creations, setCreations, notify }) {
  const [prompt,setPrompt]=useState("A majestic elephant walking through a misty forest at golden hour");
  const [style,setStyle]=useState("Photorealistic"); const [ratio,setRatio]=useState("1:1");
  const [loading,setLoading]=useState(false); const [result,setResult]=useState(null);
  async function generate(){
    if(!prompt.trim()) return notify("Please write an image idea first");
    setLoading(true);
    try{
      const res=await fetch(`${API}/api/images/generate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,style,ratio})});
      const data=await res.json(); if(!res.ok) throw new Error(data.message);
      setResult(data); setCreations(prev=>[data,...prev]); notify("Image generated successfully");
    }catch(e){notify(e.message||"Generation failed");}finally{setLoading(false)}
  }
  return <main className="page"><section className="page-title"><div><span className="eyebrow"><Sparkles size={14}/>AI IMAGE STUDIO</span><h1>Turn your idea into an image.</h1><p>Describe anything in simple English or Hindi. VisionCraft handles the creative details.</p></div><button className="outline"><History size={17}/>Generation history</button></section>
    <div className="studio-grid"><section className="creator-card"><div className="card-head"><div><b>Describe your image</b><span>Be as simple or detailed as you like</span></div><span className="step">01</span></div>
      <div className="prompt-box"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={700}/><div><button onClick={()=>setPrompt("A friendly elephant wearing round glasses, reading a book in a modern library, cinematic 3D style") }><WandSparkles size={15}/>Surprise me</button><span>{prompt.length}/700</span></div></div>
      <div className="quick-prompts"><span>Try:</span>{["Product photo","YouTube thumbnail","3D character"].map(x=><button key={x} onClick={()=>setPrompt(`Create a professional ${x.toLowerCase()} with premium lighting`)}>{x}</button>)}</div>
      <div className="divider"/><div className="card-head"><div><b>Choose a visual style</b><span>Control the overall look and feel</span></div><span className="step">02</span></div>
      <div className="style-grid">{styles.map((x,i)=><button key={x} onClick={()=>setStyle(x)} className={style===x?"selected":""}><span className={`style-art s${i}`}/><b>{x}</b></button>)}</div>
      <div className="options"><label><span>Aspect ratio</span><div>{["1:1","16:9","9:16"].map(x=><button className={ratio===x?"selected":""} onClick={()=>setRatio(x)} key={x}>{x}</button>)}</div></label><label><span>Variations</span><select><option>1 image</option><option>2 images</option><option>4 images</option></select></label></div>
      <button className="generate" onClick={generate} disabled={loading}>{loading?<LoaderCircle className="spin"/>:<Sparkles/>}{loading?"Creating your image...":"Generate image"}<span>FREE</span></button>
    </section>
    <section className="preview-card"><div className="preview-head"><div><b>Your creation</b><span>{result?"Ready to use":"Generated image will appear here"}</span></div>{result&&<button className="icon-btn" onClick={()=>window.open(result.imageUrl,"_blank")}><Download size={18}/></button>}</div>
      <div className={`canvas ratio-${ratio.replace(":","-")}`}>{loading?<div className="empty"><LoaderCircle className="spin"/><b>Creating something amazing...</b><span>Usually takes a few seconds</span></div>:result?<><img src={result.imageUrl} alt={prompt}/><div className="image-label"><Sparkles size={14}/>{result.style}</div></>:<div className="empty"><div className="empty-icon"><Image/></div><b>Your canvas is ready</b><span>Enter a prompt and generate your first image.</span></div>}</div>
      {result&&<div className="result-actions"><button onClick={generate}><Sparkles size={16}/>Regenerate</button><button onClick={()=>notify("Saved to favorites")}><FolderHeart size={16}/>Save</button><a href={result.imageUrl} target="_blank"><Download size={16}/>Download</a></div>}
      <div className="tips"><Sparkles size={18}/><div><b>Prompt tip</b><p>Add lighting, camera angle and mood for more controlled results.</p></div></div>
    </section></div>
    <section className="recent"><div className="section-head"><div><h2>Recent creations</h2><p>Your latest AI-generated visuals</p></div><button>View all</button></div><div className="recent-grid">{creations.length?creations.slice(0,4).map((c,i)=><article key={c.id||i}><img src={c.imageUrl}/><div><b>{c.prompt}</b><span>{c.style}</span></div></article>):[1,2,3,4].map(i=><article className="skeleton" key={i}/>)}</div></section>
  </main>
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function ShortsStudio({ notify, onVideoCreated }) {
  const [topic, setTopic] = useState(
    "एक छोटे से गाँव में अर्जुन नाम का एक गरीब लड़का रहता था। एक दिन उसे जंगल में सोने से भरा हुआ एक संदूक मिला। अर्जुन ने उसे अपने पास रखने के बजाय गाँव के मुखिया को सौंप दिया। उसकी ईमानदारी से प्रभावित होकर पूरे गाँव ने उसकी पढ़ाई में सहायता की। कई वर्षों बाद अर्जुन एक सफल अधिकारी बनकर अपने गाँव लौटा।"
  );
  const [duration, setDuration] = useState(30);
  const [watermark, setWatermark] = useState("@VISHAL619");
  const [style, setVideoStyle] = useState("3D Animation");
  const [language, setLanguage] = useState("Hindi");
  const [voiceGender, setVoiceGender] = useState("Female");
  const [voiceRate, setVoiceRate] = useState(0);
  const [music, setMusic] = useState("Cinematic Pulse");
  const [subtitles, setSubtitles] = useState(true);
  const [animationIntensity, setAnimationIntensity] = useState("Medium");
  const [quality, setQuality] = useState("720p");
  const [loading, setLoading] = useState(false);
  const [video, setVideo] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [progress, setProgress] = useState({
    progress: 0,
    stage: "idle",
    message: "Ready to animate your story",
  });

  async function pollJob(statusUrl) {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      await delay(2000);
      const response = await fetch(statusUrl);
      const job = await response.json();
      if (!response.ok) throw new Error(job.message || "Could not read video progress");
      setProgress(job);

      if (job.status === "completed") return job.result;
      if (job.status === "failed") throw new Error(job.message || "Video render failed");
    }
    throw new Error("Video generation took too long. Please try a shorter duration.");
  }

  async function createShort() {
    if (topic.trim().length < 20) {
      return notify("Write a story of at least 20 characters");
    }
    setLoading(true);
    setVideo(null);
    setScenes([]);
    setProgress({ progress: 1, stage: "planning", message: "Starting animation engine..." });

    try {
      const response = await fetch(`${API}/api/shorts/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          duration,
          watermark,
          style,
          language,
          voiceGender,
          voiceRate,
          music,
          subtitles,
          animationIntensity,
          quality,
        }),
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.message || "Could not start video render");
      const result = await pollJob(job.statusUrl || `${API}/api/jobs/${job.jobId}`);
      setVideo(result.videoUrl);
      setScenes(result.scenes || []);
      onVideoCreated(result);
      notify(`${result.sceneCount} animated scenes and ${result.keyframeCount} keyframes ready`);
    } catch (error) {
      setProgress({ progress: 0, stage: "failed", message: error.message });
      notify(error.message || "Video render failed");
    } finally {
      setLoading(false);
    }
  }

  const progressSteps = [
    ["planning", "Story plan"],
    ["voice", "Neural voice"],
    ["scenes", "Scene animation"],
    ["finalizing", "Final MP4"],
  ];
  const activeStep = progressSteps.findIndex(([stage]) => stage === progress.stage);

  return <main className="page">
    <section className="page-title">
      <div>
        <span className="eyebrow"><Film size={14}/>ANIMATION ENGINE 2.0</span>
        <h1>Turn a story into an animated Short.</h1>
        <p>Two AI keyframes per scene, cinematic movement, transitions, subtitles, music and neural voice.</p>
      </div>
      <span className="engine-badge"><Sparkles size={15}/>2.5D Animation</span>
    </section>

    <div className="shorts-grid">
      <section className="creator-card">
        <div className="card-head"><div><b>Write or paste your story</b><span>VisionCraft automatically plans consistent visual scenes</span></div><span className="step">01</span></div>
        <div className="prompt-box story-box">
          <textarea value={topic} onChange={(event)=>setTopic(event.target.value)} maxLength={1800}/>
          <div><button onClick={()=>setTopic("एक अकेले रोबोट को वीरान शहर में एक छोटा सा फूल मिला। हर सुबह वह उसे तूफान से बचाता और पानी देता। धीरे-धीरे उस फूल ने पूरे शहर को सुंदर बगीचे में बदल दिया। रोबोट को आखिरकार अपना घर मिल गया।")}><WandSparkles size={15}/>Hindi example</button><span>{topic.length}/1800</span></div>
        </div>

        <div className="field"><label>Video duration</label><div className="duration-row">{durations.map((value)=><button type="button" className={duration===value?"selected":""} onClick={()=>setDuration(value)} key={value}>{value<60?`${value}s`:`${value/60}m`}</button>)}</div></div>
        <div className="field"><label>Watermark</label><input value={watermark} onChange={(event)=>setWatermark(event.target.value)} placeholder="@YOURNAME"/></div>

        <div className="control-grid">
          <label>Language<select value={language} onChange={(event)=>setLanguage(event.target.value)}><option>English</option><option>Hindi</option><option>Hinglish</option></select></label>
          <label>Video style<select value={style} onChange={(event)=>setVideoStyle(event.target.value)}><option>Cinematic</option><option>3D Animation</option><option>Anime</option><option>Storybook</option><option>Educational</option></select></label>
          <label>Voice<select value={voiceGender} onChange={(event)=>setVoiceGender(event.target.value)}><option>Female</option><option>Male</option></select></label>
          <label>Background music<select value={music} onChange={(event)=>setMusic(event.target.value)}><option>Cinematic Pulse</option><option>Calm Ambient</option><option>Uplifting</option><option>None</option></select></label>
          <label>Animation<select value={animationIntensity} onChange={(event)=>setAnimationIntensity(event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label>
          <label>Export quality<select value={quality} onChange={(event)=>setQuality(event.target.value)}><option>720p</option><option>1080p</option></select></label>
        </div>

        <div className="voice-speed">
          <div><span><Volume2 size={15}/>Voice speed</span><b>{voiceRate>0?`+${voiceRate}`:voiceRate}%</b></div>
          <input type="range" min="-20" max="20" step="5" value={voiceRate} onChange={(event)=>setVoiceRate(Number(event.target.value))}/>
        </div>
        <button type="button" className={`toggle-row ${subtitles?"enabled":""}`} onClick={()=>setSubtitles((value)=>!value)}><span><Captions size={17}/><span><b>Smart subtitles</b><small>Burn scene captions into the final MP4</small></span></span><i>{subtitles?"ON":"OFF"}</i></button>

        <div className="feature-list"><span><Play/>2 keyframes/scene</span><span><Image/>Character lock</span><span><Music2/>Voice + music</span></div>
        <button className="generate" disabled={loading} onClick={createShort}>{loading?<LoaderCircle className="spin"/>:<Film/>}{loading?"Animation in progress...":"Generate Animated Story"}<span>AI 2.0</span></button>

        {(loading || progress.stage === "failed") && <div className={`render-progress ${progress.stage === "failed"?"failed":""}`}>
          <div className="progress-heading"><span>{progress.message}</span><b>{Math.round(progress.progress || 0)}%</b></div>
          <div className="progress-track"><i style={{width:`${progress.progress || 0}%`}}/></div>
          <div className="progress-steps">{progressSteps.map(([stage,label],index)=>{
            const completed = progress.stage === "completed" || activeStep > index;
            const active = progress.stage === stage;
            return <span className={completed?"completed":active?"active":""} key={stage}>{completed?<CheckCircle2/>:<Circle/>}{label}</span>
          })}</div>
        </div>}
      </section>

      <section className="phone-preview">
        <div className="phone"><div className="phone-screen">{video?<video src={video} controls autoPlay/>:<div className="empty"><Film/><b>Animated story preview</b><span>Multi-keyframe scenes will play here</span></div>}</div></div>
        {video&&<a className="download-video" href={video} download><Download/>Download MP4</a>}
        <div className="render-note"><Clock3/><span><b>Cloud animation render</b>15 seconds can take 2–5 minutes because every scene uses two AI keyframes.</span></div>
      </section>
    </div>

    {scenes.length>0&&<section className="scene-board"><div className="section-head"><div><h2>Generated animation storyboard</h2><p>{scenes.length} scenes • {scenes.length*2} consistent keyframes</p></div></div><div className="scene-grid">{scenes.map((scene,index)=><article key={scene.number||index}><div className="keyframe-stack"><img src={scene.keyframes?.[0]||scene.imageUrl} alt={`Scene ${index+1}`}/>{scene.keyframes?.[1]&&<img src={scene.keyframes[1]} alt={`Scene ${index+1} motion frame`}/>}</div><span>Scene {index+1}</span><p>{scene.text}</p></article>)}</div></section>}
  </main>
}

function LibraryPage({ creations, videos, removeVideo }) {
  const empty = !creations.length && !videos.length;
  return <main className="page">
    <section className="page-title"><div><span className="eyebrow"><LayoutGrid size={14}/>CREATIVE LIBRARY</span><h1>My creations</h1><p>Your latest AI visuals and animated stories in one portfolio workspace.</p></div></section>
    {videos.length>0&&<section className="library-section"><div className="section-head"><div><h2>Animated stories</h2><p>Recent video renders from this browser</p></div></div><div className="video-library-grid">{videos.map((video)=><article key={video.id}><video src={video.videoUrl} controls preload="metadata"/><div><span><Film size={13}/>{video.sceneCount} scenes • {video.duration}s</span><b>{video.language} • {video.voiceGender} voice</b><div><a href={video.videoUrl} download><Download size={15}/>Download</a><button onClick={()=>removeVideo(video.id)}><Trash2 size={15}/>Remove</button></div></div></article>)}</div></section>}
    {creations.length>0&&<section className="library-section"><div className="section-head"><div><h2>AI images</h2><p>Recently generated visuals</p></div></div><div className="library-grid">{creations.map((creation,index)=><article key={creation.id||index}><img src={creation.imageUrl}/><div><b>{creation.prompt}</b><span>{creation.style}</span></div></article>)}</div></section>}
    {empty&&<div className="library-empty"><Image/><h3>No creations yet</h3><p>Generate your first image or animated story.</p></div>}
  </main>
}

export default function App() {
  const [page,setPage]=useState("studio");
  const [open,setOpen]=useState(false);
  const [creations,setCreations]=useState([]);
  const [videos,setVideos]=useState([]);
  const [toast,setToast]=useState("");
  const [profileImage,setProfileImage]=useState("/vishal-profile.png");

  useEffect(()=>{
    setProfileImage(localStorage.getItem("visioncraft-profile-image")||"/vishal-profile.png");
    try { setVideos(JSON.parse(localStorage.getItem("visioncraft-video-history")||"[]")); } catch { setVideos([]); }
  },[]);

  function onVideoCreated(video) {
    setVideos((current)=>{
      const next=[video,...current.filter((item)=>item.id!==video.id)].slice(0,8);
      localStorage.setItem("visioncraft-video-history",JSON.stringify(next));
      return next;
    });
  }

  function removeVideo(id) {
    setVideos((current)=>{
      const next=current.filter((item)=>item.id!==id);
      localStorage.setItem("visioncraft-video-history",JSON.stringify(next));
      return next;
    });
  }

  const notify=(message)=>{setToast(message);setTimeout(()=>setToast(""),4200)};
  return <div className="app">
    <Sidebar {...{page,setPage,open,setOpen,profileImage}}/>
    <div className="shell">
      <Header {...{setOpen,profileImage,setProfileImage,notify}}/>
      {page==="studio"?<ImageStudio {...{creations,setCreations,notify}}/>:page==="shorts"?<ShortsStudio {...{notify,onVideoCreated}}/>:<LibraryPage {...{creations,videos,removeVideo}}/>}
    </div>
    {toast&&<div className="toast"><Sparkles size={17}/>{toast}</div>}
    {open&&<div className="backdrop" onClick={()=>setOpen(false)}/>}
  </div>
}
