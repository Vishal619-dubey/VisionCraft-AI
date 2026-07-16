import { useEffect, useRef, useState } from "react";
import {
  Bell, Camera, ChevronDown, Clock3, Download, Film, FolderHeart,
  History, Image, LayoutGrid, LoaderCircle, Menu, Play, Search,
  Settings, Sparkles, WandSparkles, X, Zap
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const styles = ["Photorealistic", "Cinematic", "3D Render", "Anime", "Digital Art", "Minimal"];
const durations = [15, 30, 45, 60, 90, 120];

function Sidebar({ page, setPage, open, setOpen }) {
  const items = [
    ["studio", WandSparkles, "Create Image"], ["shorts", Film, "Shorts Studio"],
    ["gallery", LayoutGrid, "My Creations"], ["favorites", FolderHeart, "Favorites"],
    ["history", History, "History"]
  ];
  return <aside className={`sidebar ${open ? "open" : ""}`}>
    <div className="brand"><span className="brandmark vc-logo"><Sparkles /><i className="orbit-one"/><i className="orbit-two"/></span><span>VisionCraft <b>AI</b></span></div>
    <button className="close-mobile" onClick={() => setOpen(false)}><X /></button>
    <div className="workspace"><div className="avatar">VD</div><div><strong>Vishal's Studio</strong><small>Creator workspace</small></div><ChevronDown size={16}/></div>
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
          <div className="profile-menu-note">Stored only in this browser</div>
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

function ShortsStudio({ notify }) {
 const [topic,setTopic]=useState("Once upon a time, a young elephant named Moti was afraid to cross the river. One day, he saw a tiny bird trapped near the water. Moti gathered his courage, crossed the river and saved the bird. From that day, he understood that courage means helping someone even when you feel afraid."); const [duration,setDuration]=useState(30); const [watermark,setWatermark]=useState("@VISHAL619"); const [style,setVideoStyle]=useState("Cinematic"); const [language,setLanguage]=useState("English"); const [loading,setLoading]=useState(false); const [video,setVideo]=useState(null); const [scenes,setScenes]=useState([]);
 async function createShort(){if(topic.trim().length<20)return notify("Write a story of at least 20 characters");setLoading(true);setVideo(null);setScenes([]);try{const res=await fetch(`${API}/api/shorts/create`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,duration,watermark,style,language})});const data=await res.json();if(!res.ok)throw new Error(data.message);setVideo(data.videoUrl);setScenes(data.scenes||[]);notify(`${data.sceneCount} scenes rendered with narration`);}catch(e){notify(e.message||"Video render failed")}finally{setLoading(false)}}
 return <main className="page"><section className="page-title"><div><span className="eyebrow"><Film size={14}/>AI STORY-TO-VIDEO</span><h1>Turn a story into an animated Short.</h1><p>VisionCraft creates multiple scenes, cinematic motion, neural narration and your watermark.</p></div></section><div className="shorts-grid"><section className="creator-card"><div className="card-head"><div><b>Write or paste your story</b><span>Each sentence becomes a unique visual scene</span></div></div><div className="prompt-box story-box"><textarea value={topic} onChange={e=>setTopic(e.target.value)} maxLength={1800}/><div><button onClick={()=>setTopic("A lonely robot discovered a small flower growing in an abandoned city. Every morning, he protected it from storms and brought it water. Slowly, the flower turned the grey city into a beautiful garden. The robot finally found a home.")}><WandSparkles size={15}/>Example story</button><span>{topic.length}/1800</span></div></div><div className="field"><label>Video duration</label><div className="duration-row">{durations.map(x=><button className={duration===x?"selected":""} onClick={()=>setDuration(x)} key={x}>{x<60?`${x}s`:`${x/60}m`}</button>)}</div></div><div className="field"><label>Watermark</label><input value={watermark} onChange={e=>setWatermark(e.target.value)} placeholder="@YOURNAME"/></div><div className="two-fields"><label>Language<select value={language} onChange={e=>setLanguage(e.target.value)}><option>English</option><option>Hindi</option><option>Hinglish</option></select></label><label>Video style<select value={style} onChange={e=>setVideoStyle(e.target.value)}><option>Cinematic</option><option>3D Animation</option><option>Anime</option><option>Storybook</option><option>Educational</option></select></label></div><div className="feature-list"><span><Play/>Multi-scene MP4</span><span><Image/>New visual per scene</span><span><Sparkles/>Neural voice</span></div><button className="generate" disabled={loading} onClick={createShort}>{loading?<LoaderCircle className="spin"/>:<Film/>}{loading?"Generating scenes & rendering...":"Generate Story Video"}<span>FREE</span></button>{loading&&<p className="render-help">Please wait while unique scene images and the final video are generated.</p>}</section><section className="phone-preview"><div className="phone"><div className="phone-screen">{video?<video src={video} controls autoPlay/>:<div className="empty"><Film/><b>Story video preview</b><span>Your generated scenes will play here</span></div>}</div></div>{video&&<a className="download-video" href={video} download><Download/>Download MP4</a>}<div className="render-note"><Clock3/><span><b>Multi-scene rendering</b>30 seconds may take 1–3 minutes on a normal laptop.</span></div></section></div>{scenes.length>0&&<section className="scene-board"><div className="section-head"><div><h2>Generated storyboard</h2><p>{scenes.length} unique scenes used in your video</p></div></div><div className="scene-grid">{scenes.map((scene,i)=><article key={i}><img src={scene.imageUrl}/><span>Scene {i+1}</span><p>{scene.text}</p></article>)}</div></section>}</main>
}

function LibraryPage({ creations }){return <main className="page"><section className="page-title"><div><span className="eyebrow"><LayoutGrid size={14}/>CREATIVE LIBRARY</span><h1>My creations</h1><p>Everything you generate stays organized in one workspace.</p></div></section><div className="library-grid">{creations.map((c,i)=><article key={c.id||i}><img src={c.imageUrl}/><div><b>{c.prompt}</b><span>{c.style}</span></div></article>)}{!creations.length&&<div className="library-empty"><Image/><h3>No creations yet</h3><p>Generate your first visual from the Image Studio.</p></div>}</div></main>}

export default function App(){const [page,setPage]=useState("studio");const [open,setOpen]=useState(false);const [creations,setCreations]=useState([]);const [toast,setToast]=useState("");const [profileImage,setProfileImage]=useState("");useEffect(()=>{setProfileImage(localStorage.getItem("visioncraft-profile-image")||"")},[]);const notify=(m)=>{setToast(m);setTimeout(()=>setToast(""),4200)};return <div className="app"><Sidebar {...{page,setPage,open,setOpen}}/><div className="shell"><Header {...{setOpen,profileImage,setProfileImage,notify}}/>{page==="studio"?<ImageStudio {...{creations,setCreations,notify}}/>:page==="shorts"?<ShortsStudio notify={notify}/>:<LibraryPage creations={creations}/>}</div>{toast&&<div className="toast"><Sparkles size={17}/>{toast}</div>}{open&&<div className="backdrop" onClick={()=>setOpen(false)}/>}</div>}
