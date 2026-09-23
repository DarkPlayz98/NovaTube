import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 10000);
const webOrigin = process.env.WEB_ORIGIN || "*";
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
    })
  : null;
const cache = new Map();
const jwtSecret = process.env.JWT_SECRET || "novatube-development-secret";
const CACHE_TTL = 45_000;
const allowedOrigins = webOrigin === "*" ? null : new Set(webOrigin.split(",").map((x) => x.trim()).filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !allowedOrigins || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by NovaTube API."));
  },
  credentials: true
}));
app.use(express.json({ limit: "256kb" }));

const sql = async (text, params = []) => {
  if (!pool) throw new Error("DATABASE_NOT_CONFIGURED");
  return pool.query(text, params);
};

async function initDb() {
  if (!pool) return;
  await sql(`
    create table if not exists users (
      id bigserial primary key,
      email text unique not null,
      password_hash text not null,
      display_name text not null,
      avatar_url text,
      created_at timestamptz not null default now()
    );
    create table if not exists subscriptions (
      user_id bigint not null references users(id) on delete cascade,
      channel_id text not null,
      channel_title text not null,
      channel_thumbnail text,
      created_at timestamptz not null default now(),
      primary key (user_id, channel_id)
    );
    create table if not exists video_actions (
      user_id bigint not null references users(id) on delete cascade,
      video_id text not null,
      liked boolean not null default false,
      saved boolean not null default false,
      updated_at timestamptz not null default now(),
      primary key (user_id, video_id)
    );
    create table if not exists history (
      user_id bigint not null references users(id) on delete cascade,
      video_id text not null,
      title text not null,
      channel_title text not null,
      thumbnail text,
      watched_at timestamptz not null default now(),
      primary key (user_id, video_id)
    );
    create table if not exists comments (
      id bigserial primary key,
      user_id bigint references users(id) on delete set null,
      video_id text not null,
      display_name text not null,
      body text not null check (char_length(body) between 1 and 1000),
      created_at timestamptz not null default now()
    );
    create index if not exists idx_comments_video on comments(video_id, created_at desc);
    create index if not exists idx_history_user on history(user_id, watched_at desc);
  `);
}

function tokenFrom(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}
function auth(req, _res, next) {
  const token = tokenFrom(req);
  if (token) {
    try { req.user = jwt.verify(token, jwtSecret); } catch { req.user = null; }
  }
  next();
}
function requireAuth(req, res, next) {
  if (!pool) return res.status(503).json({ error: "Accounts require DATABASE_URL on the API." });
  if (!req.user?.id) return res.status(401).json({ error: "Sign in required." });
  next();
}
function cached(key) {
  const row = cache.get(key);
  if (!row || Date.now() > row.expires) { cache.delete(key); return null; }
  return row.value;
}
function putCache(key, value, ttl = CACHE_TTL) {
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
}
async function yt(path, params = {}) {
  if (!process.env.YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not configured.");
  const query = new URLSearchParams({ key: process.env.YOUTUBE_API_KEY, ...params });
  const keyless = `${path}?${query.toString().replace(process.env.YOUTUBE_API_KEY, "redacted")}`;
  const hit = cached(keyless);
  if (hit) return hit;
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${query}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `YouTube API error ${response.status}`);
  return putCache(keyless, data);
}
function duration(iso = "") {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
}
function durationText(sec) {
  const s = Math.max(0, Number(sec || 0));
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function normalize(items) {
  return items.map((item) => {
    const id = item.id?.videoId || item.id;
    if (!id || !item.snippet) return null;
    const seconds = duration(item.contentDetails?.duration || "");
    return {
      id,
      title: item.snippet.title || "Untitled",
      description: item.snippet.description || "",
      channelId: item.snippet.channelId || "",
      channelTitle: item.snippet.channelTitle || "Unknown creator",
      publishedAt: item.snippet.publishedAt || null,
      thumbnail: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      thumbMedium: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      duration: seconds,
      durationText: durationText(seconds),
      views: Number(item.statistics?.viewCount || 0),
      likes: Number(item.statistics?.likeCount || 0),
      commentsCount: Number(item.statistics?.commentCount || 0),
      live: item.snippet.liveBroadcastContent === "live",
      liveDetails: item.liveStreamingDetails || null,
      tags: item.snippet.tags || []
    };
  }).filter(Boolean);
}
async function feed({ mode, q, pageToken }) {
  const spec = {
    home: { order: "relevance" },
    recent: { order: "date" },
    music: { order: "relevance", q: q || "music" },
    gaming: { order: "relevance", q: q || "gaming" },
    news: { order: "date", q: q || "news" },
    shorts: { order: "date", q: q || "shorts", videoDuration: "short" },
    live: { order: "date", eventType: "live" }
  }[mode] || { order: "relevance" };
  const params = {
    part: "snippet",
    type: "video",
    maxResults: "24",
    order: spec.order,
    videoEmbeddable: "true"
  };
  if (spec.q) params.q = spec.q;
  if (spec.eventType) params.eventType = spec.eventType;
  if (spec.videoDuration) params.videoDuration = spec.videoDuration;
  if (pageToken) params.pageToken = pageToken;
  if (q && ["home", "recent"].includes(mode)) params.q = q;

  const search = await yt("search", params);
  const ids = search.items.map((item) => item.id?.videoId).filter(Boolean);
  if (!ids.length) return { items: [], nextPageToken: null };
  const details = await yt("videos", {
    part: "snippet,contentDetails,statistics,liveStreamingDetails",
    id: ids.join(",")
  });
  const byId = new Map(details.items.map((item) => [item.id, item]));
  return {
    items: normalize(search.items.map((item) => ({ ...item, ...byId.get(item.id?.videoId) }))),
    nextPageToken: search.nextPageToken || null
  };
}

app.get("/health", async (_req, res) => {
  let dbHealthy = false;
  if (pool) { try { await sql("select 1"); dbHealthy = true; } catch {} }
  res.json({ ok: true, service: "novatube-api", version: "1.0.0", youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY), databaseConfigured: Boolean(pool), databaseHealthy: dbHealthy });
});
app.get("/api/config", (_req, res) => res.json({
  name: "NovaTube",
  version: "1.0.0",
  features: ["home","search","shorts","live","music","gaming","news","subscriptions","history","likes","saves","comments","device-profiles"],
  playback: "youtube-official"
}));
app.get("/api/feed", async (req, res) => {
  try { res.json(await feed({ mode: String(req.query.mode || "home"), q: String(req.query.q || ""), pageToken: String(req.query.pageToken || "") })); }
  catch (e) { res.status(502).json({ error: e.message }); }
});
app.get("/api/search", async (req, res) => {
  try { res.json(await feed({ mode: "home", q: String(req.query.q || ""), pageToken: String(req.query.pageToken || "") })); }
  catch (e) { res.status(502).json({ error: e.message }); }
});
app.get("/api/video/:id", async (req, res) => {
  try {
    const data = await yt("videos", { part: "snippet,contentDetails,statistics,liveStreamingDetails", id: req.params.id });
    if (!data.items?.length) return res.status(404).json({ error: "Video not found." });
    const raw = data.items[0];
    const video = normalize([raw])[0];
    const channelData = video.channelId ? await yt("channels", { part: "snippet,statistics", id: video.channelId }) : { items: [] };
    res.json({ video, channel: channelData.items?.[0] || null, embedUrl: `https://www.youtube.com/embed/${video.id}` });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get("/api/channel/:id", async (req, res) => {
  try {
    const channelData = await yt("channels", { part: "snippet,statistics,contentDetails", id: req.params.id });
    if (!channelData.items?.length) return res.status(404).json({ error: "Channel not found." });
    const uploads = await yt("search", { part: "snippet", type: "video", channelId: req.params.id, order: "date", maxResults: "24", videoEmbeddable: "true" });
    const ids = uploads.items.map((x) => x.id?.videoId).filter(Boolean);
    const details = ids.length ? await yt("videos", { part: "snippet,contentDetails,statistics", id: ids.join(",") }) : { items: [] };
    const byId = new Map(details.items.map((x) => [x.id, x]));
    res.json({ channel: channelData.items[0], videos: normalize(uploads.items.map((x) => ({ ...x, ...byId.get(x.id?.videoId) }))) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.use(auth);

app.post("/api/auth/register", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Accounts require DATABASE_URL on the API." });
    const email = String(req.body.email || "").trim().toLowerCase();
    const displayName = String(req.body.displayName || "NovaTube user").trim().slice(0, 60);
    const password = String(req.body.password || "");
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: "Use a valid email and a password of at least 8 characters." });
    const hash = await bcrypt.hash(password, 12);
    const result = await sql("insert into users(email,password_hash,display_name) values($1,$2,$3) returning id,email,display_name,avatar_url", [email, hash, displayName]);
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, displayName: user.display_name }, jwtSecret, { expiresIn: "30d" });
    res.status(201).json({ token, user });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "That email is already registered." });
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Accounts require DATABASE_URL on the API." });
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await sql("select id,email,password_hash,display_name,avatar_url from users where email=$1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid email or password." });
    const token = jwt.sign({ id: user.id, email: user.email, displayName: user.display_name }, jwtSecret, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/me", requireAuth, async (req, res) => {
  const result = await sql("select id,email,display_name,avatar_url,created_at from users where id=$1", [req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: "Account not found." });
  res.json({ user: result.rows[0] });
});
app.get("/api/subscriptions", requireAuth, async (req, res) => {
  const result = await sql("select channel_id,channel_title,channel_thumbnail,created_at from subscriptions where user_id=$1 order by created_at desc", [req.user.id]);
  res.json({ items: result.rows });
});
app.post("/api/subscriptions/toggle", requireAuth, async (req, res) => {
  const channelId = String(req.body.channelId || "");
  if (!channelId) return res.status(400).json({ error: "channelId required" });
  const title = String(req.body.channelTitle || "Creator").slice(0, 150);
  const thumb = String(req.body.channelThumbnail || "").slice(0, 1000);
  const current = await sql("select 1 from subscriptions where user_id=$1 and channel_id=$2", [req.user.id, channelId]);
  if (current.rowCount) {
    await sql("delete from subscriptions where user_id=$1 and channel_id=$2", [req.user.id, channelId]);
    return res.json({ subscribed: false });
  }
  await sql("insert into subscriptions(user_id,channel_id,channel_title,channel_thumbnail) values($1,$2,$3,$4) on conflict do nothing", [req.user.id, channelId, title, thumb]);
  res.json({ subscribed: true });
});
app.get("/api/actions/:videoId", requireAuth, async (req, res) => {
  const result = await sql("select liked,saved from video_actions where user_id=$1 and video_id=$2", [req.user.id, req.params.videoId]);
  res.json(result.rows[0] || { liked: false, saved: false });
});
app.post("/api/actions/:videoId", requireAuth, async (req, res) => {
  const liked = Boolean(req.body.liked);
  const saved = Boolean(req.body.saved);
  await sql(`insert into video_actions(user_id,video_id,liked,saved,updated_at)
    values($1,$2,$3,$4,now())
    on conflict(user_id,video_id) do update set liked=excluded.liked,saved=excluded.saved,updated_at=now()`,
    [req.user.id, req.params.videoId, liked, saved]);
  res.json({ liked, saved });
});
app.post("/api/history", requireAuth, async (req, res) => {
  const id = String(req.body.videoId || "");
  if (!id) return res.status(400).json({ error: "videoId required" });
  await sql(`insert into history(user_id,video_id,title,channel_title,thumbnail,watched_at)
    values($1,$2,$3,$4,$5,now())
    on conflict(user_id,video_id) do update set title=excluded.title,channel_title=excluded.channel_title,thumbnail=excluded.thumbnail,watched_at=now()`,
    [req.user.id, id, String(req.body.title || "Untitled"), String(req.body.channelTitle || "Creator"), String(req.body.thumbnail || "")]);
  res.json({ ok: true });
});
app.get("/api/history", requireAuth, async (req, res) => {
  const result = await sql("select video_id as id,title,channel_title as \\"channelTitle\\",thumbnail,watched_at as \\"watchedAt\\" from history where user_id=$1 order by watched_at desc limit 100", [req.user.id]);
  res.json({ items: result.rows });
});
app.delete("/api/history", requireAuth, async (req, res) => {
  await sql("delete from history where user_id=$1", [req.user.id]);
  res.json({ ok: true });
});
app.get("/api/comments/:videoId", async (req, res) => {
  if (!pool) return res.json({ items: [] });
  const result = await sql("select id,display_name as \\"displayName\\",body,created_at as \\"createdAt\\" from comments where video_id=$1 order by created_at desc limit 100", [req.params.videoId]);
  res.json({ items: result.rows });
});
app.post("/api/comments", requireAuth, async (req, res) => {
  const videoId = String(req.body.videoId || "");
  const body = String(req.body.body || "").trim();
  if (!videoId || !body || body.length > 1000) return res.status(400).json({ error: "Comment must be between 1 and 1000 characters." });
  const row = await sql("select display_name from users where id=$1", [req.user.id]);
  const displayName = row.rows[0]?.display_name || "NovaTube user";
  const result = await sql("insert into comments(user_id,video_id,display_name,body) values($1,$2,$3,$4) returning id,display_name as \\"displayName\\",body,created_at as \\"createdAt\\"", [req.user.id, videoId, displayName, body]);
  res.status(201).json({ comment: result.rows[0] });
});

app.use((_req, res) => res.status(404).json({ error: "Not found." }));

export { app, initDb };

if (!process.env.VERCEL) {
  initDb()
    .then(() => app.listen(port, "0.0.0.0", () => console.log(`NovaTube API listening on ${port}`)))
    .catch((error) => {
      console.error("Database initialization failed:", error.message);
      app.listen(port, "0.0.0.0", () => console.log(`NovaTube API listening on ${port} without database`));
    });
}
