import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  auth,
  firebaseConfigured,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
  getIdToken
} from "./firebase.js";

const API = (import.meta.env.VITE_API_URL || "https://nova-tube-amber.vercel.app").replace(/\/$/, "");
const FALLBACK = [
  { id:"M7lc1UVf-VE", title:"YouTube IFrame Player API demo", channelTitle:"Google Developers", channelId:"", views:0, duration:0, durationText:"", thumbnail:"https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg", tags:["technology"] }
];

const NAV = [
  ["home","Home","⌂"],["shorts","Shorts","✦"],["live","Live","●"],["search","Search","⌕"],
  ["subscriptions","Subscriptions","♡"],["history","History","◷"],["saved","Saved","▣"]
];
const CHIPS = [["home","For you"],["shorts","Shorts"],["live","Live"],["music","Music"],["gaming","Gaming"],["news","News"],["recent","Recently published"]];

const local = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
};

function fmtViews(n) {
  const v = Number(n || 0);
  if (v >= 1e9) return (v/1e9).toFixed(v >= 1e10 ? 0 : 1) + "B";
  if (v >= 1e6) return (v/1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
  if (v >= 1e3) return (v/1e3).toFixed(v >= 1e4 ? 0 : 1) + "K";
  return String(v);
}
function age(date) {
  if (!date) return "";
  const sec = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return Math.floor(sec/60) + "m ago";
  if (sec < 86400) return Math.floor(sec/3600) + "h ago";
  if (sec < 2592000) return Math.floor(sec/86400) + "d ago";
  if (sec < 31536000) return Math.floor(sec/2592000) + "mo ago";
  return Math.floor(sec/31536000) + "y ago";
}
function thumb(video, lite=false) {
  if (!video) return "";
  return lite ? (video.thumbMedium || video.thumbnail) : video.thumbnail;
}

async function api(path, options={}) {
  let token = local.get("novatube_token", "");
  if (firebaseConfigured && auth?.currentUser) {
    try {
      token = await getIdToken(auth.currentUser);
      local.set("novatube_token", token);
    } catch {}
  }
  const headers = { "Content-Type":"application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(API + path, { ...options, headers });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function detectDevice() {
  const cores = navigator.hardwareConcurrency || 4;
  const ram = navigator.deviceMemory || 4;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const network = connection?.effectiveType || "unknown";
  const saveData = Boolean(connection?.saveData);
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  let gpu = "unknown";
  let gpuScore = 0;
  try {
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "WebGL";
    if (/adreno|apple|mali-g7|geforce|rtx|radeon|arc/i.test(gpu)) gpuScore = 2;
    else if (/mali|powervr|intel/i.test(gpu)) gpuScore = 1;
  } catch {}
  const pixels = Math.max(1, screen.width * screen.height);
  let battery = null;
  try {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      battery = { level: Math.round(b.level * 100), saver: b.level <= 0.15 };
    }
  } catch {}
  const memoryScore = Math.min(10, ram * 1.3);
  const cpuScore = Math.min(10, cores * 0.9);
  let score = memoryScore + cpuScore + gpuScore;
  if (saveData) score -= 5;
  if (battery?.saver) score -= 3;
  if (pixels > 2500000) score += 1;
  const mode = score < 9 ? "lite" : score < 15 ? "balanced" : "full";
  return { mode, ram, cores, gpu, network, saveData, battery, score: Math.round(score), screen: screen.width + "×" + screen.height };
}

function VideoCard({ video, lite, onOpen, onChannel, onLike, liked, onSave, saved, onShare, onNotInterested }) {
  return (
    <article className="video-card">
      <button className="thumb-button" onClick={() => onOpen(video)}>
        <img loading="lazy" src={thumb(video, lite)} alt="" />
        <span className="duration">{video.live ? "LIVE" : video.durationText}</span>
        {video.live && <span className="live-dot">● LIVE</span>}
      </button>
      <div className="video-meta">
        <button className="creator-avatar" onClick={() => onChannel(video.channelId)} aria-label={"Open " + (video.channelTitle || "creator")}>
          {video.channelThumbnail ? <img src={video.channelThumbnail} alt="" loading="lazy" /> : (video.channelTitle || "N")[0]}
        </button>
        <div className="video-copy">
          <button className="video-title" onClick={() => onOpen(video)}>{video.title}</button>
          <button className="channel-name" onClick={() => onChannel(video.channelId)}>{video.channelTitle}</button>
          <div className="video-sub">{fmtViews(video.views)} views {video.publishedAt ? "· " + age(video.publishedAt) : ""}</div>
        </div>
        <div className="card-menu">
          <button aria-label="Like" className={liked ? "icon active" : "icon"} onClick={() => onLike(video)}>♥</button>
          <button aria-label="Save" className={saved ? "icon active" : "icon"} onClick={() => onSave(video)}>▣</button>
          <button aria-label="Share" className="icon" onClick={() => onShare(video)}>↗</button>
          <button aria-label="Not interested" className="icon" onClick={() => onNotInterested(video)}>×</button>
        </div>
      </div>
    </article>
  );
}

function ShortCard({ video, active, lite, onOpen, onLike, liked, onSave, saved, onChannel }) {
  return (
    <article className="short-item">
      <div className="short-player">
        {active ? (
          <iframe
            title={video.title}
            src={"https://www.youtube.com/embed/" + video.id + "?autoplay=1&mute=1&playsinline=1&controls=1&rel=0"}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : <img src={thumb(video, lite)} alt="" loading="lazy" />}
        <div className="short-gradient"/>
        <div className="short-info">
          <button className="short-avatar" onClick={() => onChannel(video.channelId)} aria-label={"Open " + (video.channelTitle || "creator")}>
            {video.channelThumbnail ? <img src={video.channelThumbnail} alt="" loading="lazy" /> : (video.channelTitle || "N")[0]}
          </button>
          <div>
            <button className="short-channel" onClick={() => onChannel(video.channelId)}>@{video.channelTitle}</button>
            <h3>{video.title}</h3>
            <small>{fmtViews(video.views)} views</small>
          </div>
        </div>
        <div className="short-actions">
          <button className={liked ? "round-action active" : "round-action"} onClick={() => onLike(video)}>♥</button>
          <span>{fmtViews(video.likes)}</span>
          <button className={saved ? "round-action active" : "round-action"} onClick={() => onSave(video)}>▣</button>
          <span>Save</span>
          <button className="round-action" onClick={() => onOpen(video)}>↗</button>
          <span>Share</span>
        </div>
      </div>
    </article>
  );
}

function Modal({ children, onClose }) {
  return <div className="overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button>{children}</div></div>;
}

function App() {
  const [device, setDevice] = useState(null);
  const [active, setActive] = useState("home");
  const [videos, setVideos] = useState([]);
  const [shorts, setShorts] = useState([]);
  const [live, setLive] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [selected, setSelected] = useState(null);
  const [channel, setChannel] = useState(null);
  const [history, setHistory] = useState(() => local.get("novatube_history", []));
  const [saved, setSaved] = useState(() => local.get("novatube_saved", []));
  const [savedVideos, setSavedVideos] = useState(() => local.get("novatube_saved_videos", []));
  const [liked, setLiked] = useState(() => local.get("novatube_liked", []));
  const [subscriptions, setSubscriptions] = useState(() => local.get("novatube_subscriptions", []));
  const [notInterested, setNotInterested] = useState(() => local.get("novatube_not_interested", []));
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState(() => local.get("novatube_user", null));
  const [firebaseReady, setFirebaseReady] = useState(firebaseConfigured);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [performance, setPerformance] = useState(() => local.get("novatube_performance", "auto"));
  const [shortIndex, setShortIndex] = useState(0);
  const [pageToken, setPageToken] = useState(null);
  const shortRef = useRef(null);

  const lite = performance === "lite" || (performance === "auto" && device?.mode === "lite");

  useEffect(() => {
    detectDevice().then(setDevice);
    if (!firebaseConfigured) return;
    const unsubscribe = onAuthStateChanged(auth, async (account) => {
      if (!account) {
        local.set("novatube_token", "");
        local.set("novatube_user", null);
        setUser(null);
        return;
      }
      try {
        const token = await getIdToken(account, true);
        const profile = {
          id: account.uid,
          uid: account.uid,
          email: account.email || "",
          display_name: account.displayName || account.email?.split("@")[0] || "NovaTube user",
          avatar_url: account.photoURL || ""
        };
        local.set("novatube_token", token);
        local.set("novatube_user", profile);
        setUser(profile);
      } catch (e) {
        setAuthError(e.message || "Firebase sign-in failed.");
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!device) return;
    loadMode("home");
  }, [device]);

  useEffect(() => {
    if (!selected) return;
    api("/api/comments/" + selected.id).then((d) => setComments(d.items || [])).catch(() => setComments([]));
    const token = local.get("novatube_token", "");
    if (token) api("/api/actions/" + selected.id).then((d) => {
      setLiked((x) => d.liked && !x.includes(selected.id) ? [...x, selected.id] : (!d.liked ? x.filter((id) => id !== selected.id) : x));
      setSaved((x) => d.saved && !x.includes(selected.id) ? [...x, selected.id] : (!d.saved ? x.filter((id) => id !== selected.id) : x));
    }).catch(() => {});
  }, [selected?.id]);

  async function loadMode(mode, q="") {
    setLoading(true);
    setError("");
    setPageToken(null);
    try {
      const data = await api("/api/feed?mode=" + encodeURIComponent(mode) + (q ? "&q=" + encodeURIComponent(q) : ""));
      const items = data.items || [];
      if (mode === "shorts") { setShorts(items); setShortIndex(0); }
      else if (mode === "live") setLive(items);
      else setVideos(items);
      setPageToken(data.nextPageToken || null);
    } catch (e) {
      setError(e.message);
      if (mode === "home" && !videos.length) setVideos(FALLBACK);
      if (mode === "shorts" && !shorts.length) setShorts(FALLBACK);
    } finally { setLoading(false); }
  }

  async function loadMore(mode) {
    if (!pageToken || loading) return;
    try {
      const data = await api("/api/feed?mode=" + mode + "&pageToken=" + encodeURIComponent(pageToken));
      const items = data.items || [];
      if (mode === "shorts") setShorts((x) => [...x, ...items]);
      else if (mode === "live") setLive((x) => [...x, ...items]);
      else setVideos((x) => [...x, ...items]);
      setPageToken(data.nextPageToken || null);
    } catch {}
  }

  async function searchNow(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) {
      setSearched("");
      setActive("home");
      loadMode("home");
      return;
    }
    setSearched(q);
    setActive("search");
    local.set("novatube_searches", [...new Set([q, ...local.get("novatube_searches", [])])].slice(0, 30));
    await loadMode("home", q);
  }

  function applyLocal(videoList) {
    const filtered = videoList.filter((v) => !notInterested.includes(v.id));
    const signals = [...local.get("novatube_searches", []), ...subscriptions.map((s) => s.channelTitle)];
    return [...filtered].sort((a,b) => {
      const sa = signals.reduce((n,s) => n + ((a.title + " " + a.channelTitle).toLowerCase().includes(String(s).toLowerCase()) ? 4 : 0), 0);
      const sb = signals.reduce((n,s) => n + ((b.title + " " + b.channelTitle).toLowerCase().includes(String(s).toLowerCase()) ? 4 : 0), 0);
      return sb - sa;
    });
  }

  async function openVideo(video) {
    setSelected(video);
    setActive("watch");
    setHistory((old) => {
      const next = [{...video, watchedAt: Date.now()}, ...old.filter((x) => x.id !== video.id)].slice(0,100);
      local.set("novatube_history", next);
      return next;
    });
    if (local.get("novatube_token","")) {
      api("/api/history", { method:"POST", body:JSON.stringify({ videoId:video.id,title:video.title,channelTitle:video.channelTitle,thumbnail:video.thumbnail }) }).catch(() => {});
    }
  }

  function toggleList(kind, video) {
    const setter = kind === "liked" ? setLiked : setSaved;
    setter((old) => {
      const has = old.includes(video.id);
      const next = has ? old.filter((id) => id !== video.id) : [...old, video.id];
      local.set("novatube_" + kind, next);
      if (kind === "saved") {
        const nextVideos = has ? savedVideos.filter((x) => x.id !== video.id) : [{...video}, ...savedVideos.filter((x) => x.id !== video.id)].slice(0, 100);
        setSavedVideos(nextVideos);
        local.set("novatube_saved_videos", nextVideos);
      }
      if (user) {
        const body = JSON.stringify({ liked: kind === "liked" ? !has : liked.includes(video.id), saved: kind === "saved" ? !has : saved.includes(video.id) });
        api("/api/actions/" + video.id, {method:"POST", body}).catch(() => {});
      }
      return next;
    });
  }

  function share(video) {
    const url = location.origin + "/?v=" + video.id;
    if (navigator.share) navigator.share({title:video.title,url}).catch(() => {});
    else navigator.clipboard?.writeText(url);
  }

  function hide(video) {
    setNotInterested((old) => {
      const next = [...new Set([...old, video.id])];
      local.set("novatube_not_interested", next);
      return next;
    });
    setVideos((x) => x.filter((v) => v.id !== video.id));
  }

  async function openChannel(id) {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api("/api/channel/" + id);
      setChannel(data);
      setActive("channel");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function toggleSubscribe() {
    if (!channel) return;
    const info = channel.channel;
    const id = info.id;
    if (!user) return setAuthOpen(true);
    const data = await api("/api/subscriptions/toggle", {
      method:"POST",
      body:JSON.stringify({
        channelId:id,
        channelTitle:info.snippet?.title,
        channelThumbnail:info.snippet?.thumbnails?.default?.url
      })
    });
    setSubscriptions((old) => {
      const next = data.subscribed ? [...old, {channelId:id,channelTitle:info.snippet?.title,channelThumbnail:info.snippet?.thumbnails?.default?.url}] : old.filter((x) => x.channelId !== id);
      local.set("novatube_subscriptions", next);
      return next;
    });
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!commentText.trim() || !selected) return;
    if (!user) return setAuthOpen(true);
    try {
      const data = await api("/api/comments", {method:"POST", body:JSON.stringify({videoId:selected.id,body:commentText.trim()})});
      setComments((x) => [data.comment, ...x]);
      setCommentText("");
    } catch (e) { setError(e.message); }
  }

  async function submitAuth(e) {
    e.preventDefault();
    setAuthError("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const displayName = String(form.get("displayName") || "").trim();
    try {
      if (firebaseConfigured) {
        const credential = authMode === "register"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);
        if (authMode === "register" && displayName) await updateProfile(credential.user, { displayName });
        const token = await getIdToken(credential.user, true);
        const profile = {
          id: credential.user.uid,
          uid: credential.user.uid,
          email: credential.user.email || email,
          display_name: credential.user.displayName || displayName || email.split("@")[0],
          avatar_url: credential.user.photoURL || ""
        };
        local.set("novatube_token", token);
        local.set("novatube_user", profile);
        setUser(profile);
      } else {
        const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
        const body = authMode === "register" ? { email, password, displayName } : { email, password };
        const data = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
        const profile = data.user;
        local.set("novatube_token", data.token || "");
        local.set("novatube_user", profile);
        setUser(profile);
      }
      setAuthOpen(false);
    } catch (e) {
      const code = e?.code || "";
      setAuthError(code === "auth/invalid-credential" ? "Invalid email or password." : (e?.message || "Authentication failed."));
    }
  }

  async function signInGoogle() {
    setAuthError("");
    if (!firebaseConfigured) {
      setAuthError("Firebase Auth is not configured. Add the VITE_FIREBASE_* variables to the web deployment.");
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
      setAuthOpen(false);
    } catch (e) {
      setAuthError(e?.code === "auth/popup-closed-by-user" ? "Google sign-in was cancelled." : (e?.message || "Google sign-in failed."));
    }
  }

  async function logout() {
    try { if (firebaseConfigured) await signOut(auth); } catch {}
    local.set("novatube_token","");
    local.set("novatube_user",null);
    setUser(null);
  }

  const displayedVideos = useMemo(() => applyLocal(videos), [videos, notInterested, subscriptions]);
  const subSet = useMemo(() => new Set(subscriptions.map((x) => x.channelId)), [subscriptions]);
  const currentShort = shorts[shortIndex];

  useEffect(() => {
    const root = shortRef.current;
    if (!root || active !== "shorts") return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const n = Number(entry.target.getAttribute("data-short-index"));
          if (!Number.isNaN(n)) {
            setShortIndex(n);
            if (n >= shorts.length - 3) loadMore("shorts");
          }
        }
      });
    }, {root, threshold:0.65});
    root.querySelectorAll("[data-short-index]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [shorts.length, active]);

  function selectNav(next) {
    setError("");
    setActive(next);
    if (next === "home") loadMode("home");
    if (next === "shorts") loadMode("shorts");
    if (next === "live") loadMode("live");
    if (next === "subscriptions") setVideos([]);
    if (["music","gaming","news","recent"].includes(next)) loadMode(next);
  }

  if (!device) {
    return <div className="boot"><img className="boot-logo" src="/icon.svg" alt="NovaTube" /><h1>NovaTube</h1><p>Checking device capabilities before loading your interface…</p></div>;
  }

  return (
    <div className={"app mode-" + (performance === "auto" ? device.mode : performance)}>
      <header className="topbar">
        <button className="brand" onClick={() => selectNav("home")} aria-label="NovaTube home"><img className="brand-mark" src="/icon.svg" alt="" /><span>NovaTube</span></button>
        <form className="search" onSubmit={searchNow}>
          <span>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search videos, creators and Shorts" />
        </form>
        <div className="top-actions">
          <button className="top-button" onClick={() => setSettingsOpen(true)}>⚙</button>
          {user ? <button className="avatar" onClick={logout}>{(user.display_name || user.displayName || "N")[0]}</button> : <button className="sign-in" onClick={() => setAuthOpen(true)}>Sign in</button>}
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          {NAV.map(([id,label,icon]) => <button key={id} className={active===id ? "nav-item active" : "nav-item"} onClick={() => selectNav(id)}><span>{icon}</span>{label}</button>)}
          <div className="side-divider"/>
          <button className="nav-item" onClick={() => setSettingsOpen(true)}><span>⚙</span>Settings</button>
          <div className="side-cap"><b>{device.mode.toUpperCase()}</b><span>{device.cores} CPU · {device.ram} GB RAM</span></div>
        </aside>

        <main className="main">
          <nav className="chips">
            {CHIPS.map(([id,label]) => <button key={id} className={active===id ? "chip active" : "chip"} onClick={() => selectNav(id)}>{label}</button>)}
          </nav>

          {error && <div className="notice"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}

          {active === "home" && (
            <>
              <section className="hero">
                <div>
                  <p className="eyebrow">NOVA DISCOVERY</p>
                  <h1>What do you want to watch?</h1>
                  <p>Fresh videos, short-form clips and live content, presented without a separate NovaTube ad layer.</p>
                </div>
                <button className="hero-button" onClick={() => selectNav("shorts")}>Open Shorts <span>→</span></button>
              </section>
              <section className="section-head"><div><h2>{loading ? "Finding something for you…" : "Recommended"}</h2><span>Personalized locally from your activity and subscriptions.</span></div><button onClick={() => loadMode("home")} className="text-button">Refresh</button></section>
              <section className="video-grid">{displayedVideos.map((v) => <VideoCard key={v.id} video={v} lite={lite} onOpen={openVideo} onChannel={openChannel} onLike={(x)=>toggleList("liked",x)} liked={liked.includes(v.id)} onSave={(x)=>toggleList("saved",x)} saved={saved.includes(v.id)} onShare={share} onNotInterested={hide}/>)}</section>
            </>
          )}

          {active === "search" && (
            <>
              <section className="section-head"><div><h2>Search</h2><span>{searched ? "Results for “" + searched + "”" : "Search NovaTube"}</span></div></section>
              <section className="search-banner">
                <form onSubmit={searchNow} role="search">
                  <span className="search-banner-icon">⌕</span>
                  <input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search videos, creators and Shorts…" aria-label="Search videos" />
                  <button type="submit">Search</button>
                </form>
              </section>
              <section className="video-grid">{applyLocal(videos).map((v) => <VideoCard key={v.id} video={v} lite={lite} onOpen={openVideo} onChannel={openChannel} onLike={(x)=>toggleList("liked",x)} liked={liked.includes(v.id)} onSave={(x)=>toggleList("saved",x)} saved={saved.includes(v.id)} onShare={share} onNotInterested={hide}/>)}</section>
            </>
          )}

          {active === "shorts" && (
            <section className="shorts-feed" ref={shortRef}>
              {shorts.map((v,i) => <div className="short-snap" key={v.id + i} data-short-index={i}><ShortCard video={v} active={i===shortIndex} lite={lite} onOpen={openVideo} onLike={(x)=>toggleList("liked",x)} liked={liked.includes(v.id)} onSave={(x)=>toggleList("saved",x)} saved={saved.includes(v.id)} onChannel={openChannel}/></div>)}
              {!shorts.length && <Empty title="No Shorts loaded" text="Configure the YouTube Data API on NovaTube API to start the feed."/>}
            </section>
          )}

          {active === "live" && (
            <>
              <section className="section-head"><div><h2>Live now</h2><span>Active YouTube broadcasts discovered through the official API.</span></div><button className="text-button" onClick={()=>loadMode("live")}>Refresh</button></section>
              <section className="video-grid">{live.map((v) => <VideoCard key={v.id} video={v} lite={lite} onOpen={openVideo} onChannel={openChannel} onLike={(x)=>toggleList("liked",x)} liked={liked.includes(v.id)} onSave={(x)=>toggleList("saved",x)} saved={saved.includes(v.id)} onShare={share} onNotInterested={hide}/>)}</section>
              {!live.length && <Empty title="Nothing live was returned" text="The feed is based on active broadcasts currently visible to the YouTube Data API."/>}
            </>
          )}

          {["music","gaming","news","recent"].includes(active) && (
            <>
              <section className="section-head"><div><h2>{active === "recent" ? "Recently published" : active[0].toUpperCase()+active.slice(1)}</h2><span>Discovery feed powered by YouTube metadata.</span></div></section>
              <section className="video-grid">{applyLocal(videos).map((v) => <VideoCard key={v.id} video={v} lite={lite} onOpen={openVideo} onChannel={openChannel} onLike={(x)=>toggleList("liked",x)} liked={liked.includes(v.id)} onSave={(x)=>toggleList("saved",x)} saved={saved.includes(v.id)} onShare={share} onNotInterested={hide}/>)}</section>
            </>
          )}

          {active === "subscriptions" && (
            <>
              <section className="section-head"><div><h2>Subscriptions <span className="version-badge">V1</span></h2><span>{subSet.size} creators followed · V1 verification build</span></div></section>
              {!user && <Empty title="Sign in to sync subscriptions" text="Guest subscriptions stay on this device. An account syncs them through the NovaTube API." action="Sign in" onAction={()=>setAuthOpen(true)}/>}
              {user && !subscriptions.length && <Empty title="Your feed is empty" text="Open a creator and subscribe to start building this page."/>}
              <div className="creator-list">{subscriptions.map((s)=><button key={s.channelId} className="creator-row" onClick={()=>openChannel(s.channelId)}><span className="creator-avatar">{s.channelThumbnail ? <img src={s.channelThumbnail} alt="" loading="lazy" /> : (s.channelTitle||"N")[0]}</span><span><b>{s.channelTitle}</b><small>Subscribed creator</small></span></button>)}</div>
            </>
          )}

          {active === "history" && (
            <>
              <section className="section-head"><div><h2>History</h2><span>Last 100 watched items on this device or account.</span></div><button className="text-button" onClick={()=>{setHistory([]);local.set("novatube_history",[]); if(user) api("/api/history",{method:"DELETE"}).catch(()=>{})}}>Clear</button></section>
              <section className="video-grid">{history.map((v) => <VideoCard key={v.id} video={v} lite={lite} onOpen={openVideo} onChannel={openChannel} onLike={(x)=>toggleList("liked",x)} liked={liked.includes(v.id)} onSave={(x)=>toggleList("saved",x)} saved={saved.includes(v.id)} onShare={share} onNotInterested={hide}/>)}</section>
            </>
          )}

          {active === "saved" && (
            <>
              <section className="section-head"><div><h2>Saved</h2><span>{saved.length} saved videos.</span></div></section>
              {!saved.length ? <Empty title="Nothing saved yet" text="Use the save button on any video to keep it here."/> : <section className="video-grid">{savedVideos.filter((v)=>saved.includes(v.id)).map((v)=><VideoCard key={v.id} video={v} lite={lite} onOpen={openVideo} onChannel={openChannel} onLike={(x)=>toggleList("liked",x)} liked={liked.includes(v.id)} onSave={(x)=>toggleList("saved",x)} saved={saved.includes(v.id)} onShare={share} onNotInterested={hide}/>)}</section>}
            </>
          )}

          {active === "watch" && selected && (
            <WatchPage video={selected} comments={comments} commentText={commentText} setCommentText={setCommentText} onSubmitComment={submitComment} onSignIn={()=>setAuthOpen(true)} user={user} onBack={()=>setActive("home")} onLike={()=>toggleList("liked",selected)} liked={liked.includes(selected.id)} onSave={()=>toggleList("saved",selected)} saved={saved.includes(selected.id)} onShare={()=>share(selected)} onChannel={()=>openChannel(selected.channelId)} />
          )}

          {active === "channel" && channel && (
            <ChannelPage channel={channel} subscribed={subSet.has(channel.channel.id)} onSubscribe={toggleSubscribe} onOpen={openVideo} lite={lite} onChannel={openChannel} />
          )}
        </main>
      </div>

      <footer><span>NovaTube</span><span>Ad-free NovaTube interface · YouTube-powered discovery · Official embedded playback</span></footer>

      {settingsOpen && <Modal onClose={()=>setSettingsOpen(false)}><Settings device={device} performance={performance} setPerformance={(x)=>{setPerformance(x);local.set("novatube_performance",x)}} user={user} onLogout={logout}/></Modal>}
      {authOpen && <Modal onClose={()=>setAuthOpen(false)}><Auth mode={authMode} setMode={setAuthMode} onSubmit={submitAuth} onGoogle={signInGoogle} error={authError} firebaseReady={firebaseReady}/></Modal>}
      {loading && <div className="loading-pill">Loading…</div>}
    </div>
  );
}

function WatchPage({video,comments,commentText,setCommentText,onSubmitComment,onSignIn,user,onBack,onLike,liked,onSave,saved,onShare,onChannel}) {
  return <div className="watch-page">
    <button className="back-button" onClick={onBack}>← Back</button>
    <div className="watch-layout">
      <div className="watch-main">
        <div className="watch-player"><iframe title={video.title} src={"https://www.youtube.com/embed/" + video.id + "?autoplay=1&playsinline=1&controls=1&rel=0"} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/></div>
        <h1>{video.title}</h1>
        <div className="watch-stats">{fmtViews(video.views)} views {video.publishedAt ? "· " + age(video.publishedAt) : ""}</div>
        <div className="watch-actions">
          <button className={liked ? "watch-action active" : "watch-action"} onClick={onLike}>♥ Like</button>
          <button className={saved ? "watch-action active" : "watch-action"} onClick={onSave}>▣ Save</button>
          <button className="watch-action" onClick={onShare}>↗ Share</button>
        </div>
        <button className="watch-channel" onClick={onChannel}><span className="creator-avatar">{(video.channelTitle||"N")[0]}</span><span><b>{video.channelTitle}</b><small>Creator channel</small></span></button>
        <div className="description">{video.description || "No description was provided."}</div>
        <section className="comments"><h2>NovaTube comments</h2><p className="muted">These are comments stored by NovaTube, separate from YouTube comments.</p>
          {user ? <form className="comment-form" onSubmit={onSubmitComment}><input value={commentText} onChange={(e)=>setCommentText(e.target.value)} placeholder="Add a comment…"/><button>Post</button></form> : <button className="sign-in wide" type="button" onClick={onSignIn}>Sign in to comment</button>}
          {comments.map((c)=><div className="comment" key={c.id}><span className="creator-avatar">{(c.displayName||"N")[0]}</span><div><b>{c.displayName}</b><small>{age(c.createdAt)}</small><p>{c.body}</p></div></div>)}
          {!comments.length && <div className="empty-inline">No NovaTube comments yet.</div>}
        </section>
      </div>
      <aside className="watch-side"><h3>About playback</h3><p>NovaTube uses the official YouTube embedded player. NovaTube does not download, rehost, or strip YouTube-served advertising from playback.</p><a href={"https://www.youtube.com/watch?v=" + video.id} target="_blank" rel="noreferrer">Open on YouTube ↗</a></aside>
    </div>
  </div>;
}

function ChannelPage({channel,subscribed,onSubscribe,onOpen,lite,onChannel}) {
  const c=channel.channel;
  return <div className="channel-page">
    <div className="channel-header">
      <img src={c.snippet?.thumbnails?.high?.url || c.snippet?.thumbnails?.default?.url} alt=""/>
      <div><p className="eyebrow">CREATOR</p><h1>{c.snippet?.title}</h1><p>{c.snippet?.description}</p><span>{fmtViews(c.statistics?.subscriberCount)} subscribers · {fmtViews(c.statistics?.viewCount)} views</span></div>
      <button className={subscribed ? "subscribe subscribed" : "subscribe"} onClick={onSubscribe}>{subscribed ? "Subscribed" : "Subscribe"}</button>
    </div>
    <section className="section-head"><div><h2>Latest videos</h2><span>Official channel uploads returned by the API.</span></div></section>
    <section className="video-grid">{channel.videos.map((v)=><VideoCard key={v.id} video={v} lite={lite} onOpen={onOpen} onChannel={onChannel} onLike={()=>{}} liked={false} onSave={()=>{}} saved={false} onShare={()=>{}} onNotInterested={()=>{}}/>)}</section>
  </div>;
}

function Settings({device,performance,setPerformance,user,onLogout}) {
  return <div className="settings"><p className="eyebrow">NOVA SETTINGS</p><h2>Performance & account</h2>
    <div className="setting-card"><h3>Device profile</h3><div className="spec-grid"><span>Profile<b>{device.mode.toUpperCase()}</b></span><span>CPU<b>{device.cores} cores</b></span><span>RAM<b>{device.ram} GB</b></span><span>GPU<b>{String(device.gpu).slice(0,42)}</b></span><span>Network<b>{device.network}</b></span><span>Screen<b>{device.screen}</b></span></div></div>
    <div className="setting-card"><h3>Performance mode</h3><div className="segmented">{["auto","lite","balanced","full"].map((x)=><button key={x} className={performance===x ? "selected":""} onClick={()=>setPerformance(x)}>{x}</button>)}</div><p>Auto detects capabilities before rendering the main interface. Lite reduces thumbnails, animation and media concurrency.</p></div>
    <div className="setting-card"><h3>Account</h3>{user ? <><p>Signed in as <b>{user.display_name || user.displayName}</b>.</p><button className="danger-button" onClick={onLogout}>Sign out</button></> : <p>Guest mode keeps likes, saves, subscriptions and history on this device. Sign in adds server sync.</p>}</div>
  </div>;
}

function Auth({mode,setMode,onSubmit,onGoogle,error,firebaseReady}) {
  return <div className="auth"><p className="eyebrow">NOVA ACCOUNT</p><h2>{mode==="login" ? "Welcome back" : "Create your account"}</h2><p className="muted">{mode==="login" ? "Sync your NovaTube activity across devices." : "Keep subscriptions, actions, comments and history server-side."}</p>
    <button className="google-button" type="button" onClick={onGoogle} disabled={!firebaseReady}>Continue with Google</button>
    <div className="auth-divider"><span>or</span></div>
    <form onSubmit={onSubmit} className="auth-form">{mode==="register" && <input name="displayName" placeholder="Display name" required/>}<input name="email" type="email" placeholder="Email" required/><input name="password" type="password" placeholder="Password (8+ characters)" minLength="8" required/>{error && <div className="error-text">{error}</div>}<button className="primary-wide">{mode==="login" ? "Sign in with email" : "Create account"}</button></form>
    {!firebaseReady && <p className="muted auth-note">Email/password works without Firebase. Google sign-in needs the VITE_FIREBASE_* variables on Vercel.</p>}
    <button className="text-button center" onClick={()=>setMode(mode==="login"?"register":"login")}>{mode==="login" ? "Create a new account" : "I already have an account"}</button>
  </div>;
}

function Empty({title,text,action,onAction}) {
  return <div className="empty"><div className="empty-icon">N</div><h3>{title}</h3><p>{text}</p>{action && <button className="primary-wide compact" onClick={onAction}>{action}</button>}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
