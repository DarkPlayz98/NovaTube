# NovaTube

NovaTube is a clean, mobile-first video discovery platform built around official YouTube discovery metadata and official embedded playback.

## Final product

- Home / For You discovery
- Search for videos
- Full-screen vertical Shorts-style feed with scroll snap and muted autoplay
- Live-now discovery
- Music, Gaming, News and Recently Published feeds
- Video watch page with official YouTube iframe playback
- Creator/channel pages with latest uploads
- Subscribe / unsubscribe
- Like, save, share and not-interested actions
- Local recommendation signals from searches, subscriptions and watch history
- Device capability detection before the main interface loads
- Automatic Lite / Balanced / Full performance profiles
- Manual performance override, data-saver-aware behavior and reduced animation on Lite
- Local guest history, likes, saves, subscriptions and preferences
- Optional PostgreSQL-backed accounts, subscriptions, history, actions and NovaTube comments
- PWA manifest and Vercel SPA routing
- GitHub Actions build/syntax verification
- Render Blueprint for the API and free PostgreSQL

## Architecture

- `web/` — React + Vite frontend, suitable for Vercel
- `api/` — Express API, suitable for Render
- PostgreSQL — account data and NovaTube-owned social state
- In-memory API cache — keeps repeated YouTube metadata calls lighter on a small Render instance
- YouTube Data API v3 — discovery, search, live broadcasts, video/channel metadata
- YouTube embedded player — official playback

## Important playback boundary

NovaTube does not download, rehost, extract, or strip advertising from YouTube videos. A video is played through the official YouTube embedded player, while NovaTube's own surrounding interface contains no third-party ad layer.

The YouTube Data API's `videoDuration=short` search filter is used for the short-form discovery feed; the API defines that filter as videos shorter than four minutes, so this feed is discovery-oriented rather than a claim that every result is an official YouTube Shorts classification.

## Run locally

### API

```bash
cd api
cp .env.example .env
npm install
npm start
```

Set:

```text
YOUTUBE_API_KEY=your_key
DATABASE_URL=your_postgres_connection_string
JWT_SECRET=your_long_random_secret
WEB_ORIGIN=http://localhost:5173
```

`DATABASE_URL` can be omitted while testing discovery/playback. Accounts and server-synced social features require PostgreSQL.

### Web

```bash
cd web
npm install
npm run dev
```

For a separately deployed frontend, set:

```text
VITE_API_URL=https://YOUR-RENDER-API.onrender.com
```

## Render

The included `render.yaml` creates:

- `novatube-api` — free Render web service
- `novatube-db` — free Render Postgres, wired to `DATABASE_URL`

Free Render Postgres is intended for testing/hobby use and currently expires after 30 days, so move to a paid database before treating the deployment as permanent.

## Vercel

Use `web/` as the Vercel project root. The included `web/vercel.json` keeps client-side routes on `index.html`.

## Project status

This repository is intentionally kept as the final product shape rather than an MVP/staging roadmap. Provider credentials, deployment URLs and user-created account data remain external configuration rather than being committed to Git.
