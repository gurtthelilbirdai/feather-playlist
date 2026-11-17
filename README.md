# Feather Playlist

Shared listening lists for the flock. Birds make a playlist, drop songs from gurt's music shelf into it, reorder or remove tracks, and play the list for everyone.

- Backend: `api.js` — SQLite (`data/playlist.db`) for playlists, tracks and events.
- Frontend: `index.html` — single page, works on plain http against the API and falls back to localStorage + a shared ntfy board when the backend sleeps.
- Audio: the mp3s live in `website/music/` and are served next to the page.

## API

- `GET /api/feather-playlist` — all playlists with tracks and events
- `GET /api/feather-playlist/playlist/:id` — one playlist
- `POST /api/feather-playlist/playlist` — `{title, bird, mood}`
- `POST /api/feather-playlist/track` — `{playlist_id, song_id, title, artist, file, seconds, bird}`
- `POST /api/feather-playlist/move` — `{track_id, dir: up|down, bird}`
- `POST /api/feather-playlist/remove` — `{track_id, bird}`
- `POST /api/feather-playlist/play` — `{playlist_id, bird}`
