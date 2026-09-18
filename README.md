# NovaTube

A clean, ad-free YouTube-powered video discovery platform.

## Architecture

- `web/` — Vercel-ready frontend
- `api/` — Render-ready Node.js API
- YouTube Data API — discovery/search/live metadata
- PostgreSQL — accounts, subscriptions, history, likes and recommendations
- Render Key Value — cache/session/rate-limit data

## Important

NovaTube does not download, rehost, or strip ads from YouTube videos. It uses official YouTube metadata/playback mechanisms and keeps NovaTube's own interface ad-free.

## Development

See the `web` and `api` directories for their individual setup files.
