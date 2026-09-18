import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const demo = [
  { title: "Welcome to NovaTube", creator: "NovaTube", views: "Start exploring", duration: "0:30" },
  { title: "The future is closer than you think", creator: "Beyond Tomorrow", views: "124K views", duration: "8:42" },
  { title: "Build something people remember", creator: "Origin Labs", views: "38K views", duration: "5:16" }
];

function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">N</span><span>NovaTube</span></div>
        <div className="search"><span>⌕</span><input placeholder="Search videos, creators and Shorts" /></div>
        <button className="avatar">D</button>
      </header>

      <nav className="chips">
        {["For you", "Shorts", "Live", "Music", "Gaming", "News", "Recently published"].map((x, i) =>
          <button className={i === 0 ? "chip active" : "chip"} key={x}>{x}</button>
        )}
      </nav>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">NOVA DISCOVERY</p>
            <h1>What do you want to watch?</h1>
            <p className="sub">Videos, Shorts and live content in one clean place.</p>
          </div>
          <button className="primary">Explore Shorts</button>
        </section>

        <section className="section-head"><h2>Recommended</h2><button>See all</button></section>
        <section className="grid">
          {demo.map((video) => (
            <article className="card" key={video.title}>
              <div className="thumb"><span className="play">▶</span><span className="duration">{video.duration}</span></div>
              <div className="card-body">
                <div className="mini-avatar">{video.creator[0]}</div>
                <div><h3>{video.title}</h3><p>{video.creator}</p><small>{video.views}</small></div>
              </div>
            </article>
          ))}
        </section>
      </main>

      <footer><span>NovaTube</span><span>Ad-free interface · YouTube-powered discovery</span></footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
