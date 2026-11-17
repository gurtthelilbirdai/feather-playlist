// Feather Playlist API: shared playlists for the flock, with real tracks from gurt's music shelf.
// SQLite storage for playlists, tracks and events.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'playlist.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  bird TEXT DEFAULT 'gurt',
  mood TEXT DEFAULT '',
  created TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'gurt',
  file TEXT DEFAULT '',
  seconds INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  added_by TEXT DEFAULT 'gurt',
  created TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id TEXT DEFAULT '',
  kind TEXT NOT NULL,
  by_bird TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tr_pl ON tracks(playlist_id);`);

const now = () => new Date().toISOString();
const rid = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); } });
  });
}
function addEvent(playlist_id, kind, by_bird, note) {
  db.prepare('INSERT INTO events (playlist_id,kind,by_bird,note,created) VALUES (?,?,?,?,?)')
    .run(playlist_id, kind, by_bird || 'gurt', note || '', now());
}
function trackRow(t) {
  return { id: t.id, playlist_id: t.playlist_id, song_id: t.song_id, title: t.title,
           artist: t.artist, file: t.file, seconds: t.seconds, position: t.position,
           added_by: t.added_by, created: t.created };
}
function playlistRow(p) {
  const tracks = db.prepare('SELECT * FROM tracks WHERE playlist_id=? ORDER BY position ASC, created ASC').all(p.id).map(trackRow);
  const events = db.prepare('SELECT * FROM events WHERE playlist_id=? ORDER BY created ASC').all(p.id)
    .map(e => ({ kind: e.kind, by_bird: e.by_bird, note: e.note, created: e.created }));
  return { id: p.id, title: p.title, bird: p.bird, mood: p.mood, created: p.created, tracks, events };
}

module.exports = function handler(req, res, route) {
  route = Array.isArray(route) ? route.join('/') : String(route || '');
  const seg = route.split('/').filter(Boolean);

  if (req.method === 'GET' && seg.length === 0) {
    const playlists = db.prepare('SELECT * FROM playlists ORDER BY created DESC').all().map(playlistRow);
    const tracks = db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n;
    const birds = db.prepare('SELECT COUNT(DISTINCT bird) AS n FROM playlists').get().n;
    const seconds = db.prepare('SELECT COALESCE(SUM(seconds),0) AS n FROM tracks').get().n;
    return json(res, 200, { playlists, total: playlists.length, tracks, birds, seconds });
  }

  if (req.method === 'GET' && seg[0] === 'playlist' && seg[1]) {
    const p = db.prepare('SELECT * FROM playlists WHERE id=?').get(seg[1]);
    if (!p) return json(res, 404, { error: 'no such playlist' });
    return json(res, 200, { playlist: playlistRow(p) });
  }

  if (req.method === 'POST' && seg[0] === 'playlist') {
    return readBody(req).then((b) => {
      const title = String(b.title || '').trim();
      if (!title) return json(res, 400, { error: 'a playlist needs a title' });
      const p = { id: 'PL-' + rid(), title, bird: String(b.bird || 'gurt').trim() || 'gurt',
                  mood: String(b.mood || '').trim(), created: now() };
      db.prepare('INSERT INTO playlists (id,title,bird,mood,created) VALUES (?,?,?,?,?)')
        .run(p.id, p.title, p.bird, p.mood, p.created);
      addEvent(p.id, 'created', p.bird, p.title);
      return json(res, 200, { ok: true, playlist: playlistRow(p) });
    });
  }

  if (req.method === 'POST' && seg[0] === 'track') {
    return readBody(req).then((b) => {
      const pid = String(b.playlist_id || '').trim();
      const p = db.prepare('SELECT * FROM playlists WHERE id=?').get(pid);
      if (!p) return json(res, 404, { error: 'no such playlist' });
      const title = String(b.title || '').trim();
      if (!title) return json(res, 400, { error: 'a track needs a title' });
      const max = db.prepare('SELECT COALESCE(MAX(position),-1) AS m FROM tracks WHERE playlist_id=?').get(pid).m;
      const t = { id: 'TR-' + rid(), playlist_id: pid, song_id: String(b.song_id || '').trim(),
                  title, artist: String(b.artist || 'gurt').trim() || 'gurt',
                  file: String(b.file || '').trim(), seconds: parseInt(b.seconds || 0, 10) || 0,
                  position: max + 1, added_by: String(b.bird || p.bird).trim() || 'gurt', created: now() };
      db.prepare('INSERT INTO tracks (id,playlist_id,song_id,title,artist,file,seconds,position,added_by,created) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(t.id, t.playlist_id, t.song_id, t.title, t.artist, t.file, t.seconds, t.position, t.added_by, t.created);
      addEvent(pid, 'track added', t.added_by, t.title);
      return json(res, 200, { ok: true, track: trackRow(t), playlist: playlistRow(p) });
    });
  }

  if (req.method === 'POST' && seg[0] === 'remove') {
    return readBody(req).then((b) => {
      const tid = String(b.track_id || '').trim();
      const t = db.prepare('SELECT * FROM tracks WHERE id=?').get(tid);
      if (!t) return json(res, 404, { error: 'no such track' });
      db.prepare('DELETE FROM tracks WHERE id=?').run(tid);
      addEvent(t.playlist_id, 'track removed', String(b.bird || 'gurt'), t.title);
      const p = db.prepare('SELECT * FROM playlists WHERE id=?').get(t.playlist_id);
      return json(res, 200, { ok: true, playlist: playlistRow(p) });
    });
  }

  if (req.method === 'POST' && seg[0] === 'move') {
    return readBody(req).then((b) => {
      const tid = String(b.track_id || '').trim();
      const dirn = b.dir === 'up' ? -1 : 1;
      const t = db.prepare('SELECT * FROM tracks WHERE id=?').get(tid);
      if (!t) return json(res, 404, { error: 'no such track' });
      const list = db.prepare('SELECT * FROM tracks WHERE playlist_id=? ORDER BY position ASC, created ASC').all(t.playlist_id);
      const i = list.findIndex(x => x.id === tid);
      const j = i + dirn;
      if (j < 0 || j >= list.length) return json(res, 200, { ok: true, playlist: playlistRow(db.prepare('SELECT * FROM playlists WHERE id=?').get(t.playlist_id)) });
      const a = list[i], c = list[j];
      const upd = db.prepare('UPDATE tracks SET position=? WHERE id=?');
      upd.run(c.position, a.id); upd.run(a.position, c.id);
      addEvent(t.playlist_id, 'reordered', String(b.bird || 'gurt'), a.title);
      const p = db.prepare('SELECT * FROM playlists WHERE id=?').get(t.playlist_id);
      return json(res, 200, { ok: true, playlist: playlistRow(p) });
    });
  }

  if (req.method === 'POST' && seg[0] === 'play') {
    return readBody(req).then((b) => {
      const pid = String(b.playlist_id || '').trim();
      const p = db.prepare('SELECT * FROM playlists WHERE id=?').get(pid);
      if (!p) return json(res, 404, { error: 'no such playlist' });
      addEvent(pid, 'played', String(b.bird || 'gurt'), String(b.note || ''));
      return json(res, 200, { ok: true, playlist: playlistRow(p) });
    });
  }

  return json(res, 404, { error: 'not found' });
};
