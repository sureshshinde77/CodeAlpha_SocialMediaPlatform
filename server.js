const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');

const app = express();
const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Auth middleware ----------
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in' });
  }
}

// ---------- Auth routes ----------
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6)
    return res.status(400).json({ error: 'Username and a password of 6+ characters required' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username))
    return res.status(409).json({ error: 'Username already taken' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
  const token = jwt.sign({ id: r.lastInsertRowid, username }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: r.lastInsertRowid, username } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || !bcrypt.compareSync(password || '', u.password))
    return res.status(401).json({ error: 'Invalid username or password' });
  const token = jwt.sign({ id: u.id, username: u.username }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: u.id, username: u.username } });
});

// ---------- Profiles ----------
app.get('/api/users/:username', auth, (req, res) => {
  const u = db.prepare('SELECT id, username, bio, created_at FROM users WHERE username = ?').get(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  u.followers = db.prepare('SELECT COUNT(*) c FROM follows WHERE following_id = ?').get(u.id).c;
  u.following = db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id = ?').get(u.id).c;
  u.isFollowing = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, u.id);
  res.json(u);
});

app.put('/api/profile', auth, (req, res) => {
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run((req.body.bio || '').slice(0, 160), req.user.id);
  res.json({ ok: true });
});

// ---------- Follow / unfollow ----------
app.post('/api/users/:id/follow', auth, (req, res) => {
  const target = Number(req.params.id);
  if (target === req.user.id) return res.status(400).json({ error: "You can't follow yourself" });
  const exists = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, target);
  if (exists) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, target);
    return res.json({ following: false });
  }
  db.prepare('INSERT INTO follows VALUES (?, ?)').run(req.user.id, target);
  res.json({ following: true });
});

// ---------- Posts ----------
const POST_SELECT = `
  SELECT p.id, p.content, p.created_at, u.id AS user_id, u.username,
    (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes,
    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments,
    EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = @me) AS liked
  FROM posts p JOIN users u ON u.id = p.user_id`;

app.post('/api/posts', auth, (req, res) => {
  const content = (req.body.content || '').trim().slice(0, 280);
  if (!content) return res.status(400).json({ error: 'Post cannot be empty' });
  db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.user.id, content);
  res.json({ ok: true });
});

// Feed: your posts + posts from people you follow (?scope=all shows everyone)
app.get('/api/feed', auth, (req, res) => {
  const where = req.query.scope === 'all' ? '' :
    'WHERE p.user_id = @me OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = @me)';
  res.json(db.prepare(`${POST_SELECT} ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT 50`).all({ me: req.user.id }));
});

app.get('/api/users/:username/posts', auth, (req, res) => {
  res.json(db.prepare(`${POST_SELECT} WHERE u.username = @name ORDER BY p.created_at DESC, p.id DESC`)
    .all({ me: req.user.id, name: req.params.username }));
});

app.delete('/api/posts/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ deleted: r.changes > 0 });
});

// ---------- Likes ----------
app.post('/api/posts/:id/like', auth, (req, res) => {
  const ex = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.user.id, req.params.id);
  if (ex) db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.user.id, req.params.id);
  else db.prepare('INSERT INTO likes VALUES (?, ?)').run(req.user.id, req.params.id);
  res.json({ liked: !ex });
});

// ---------- Comments ----------
app.get('/api/posts/:id/comments', auth, (req, res) => {
  res.json(db.prepare(`SELECT c.id, c.content, c.created_at, u.username FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at`).all(req.params.id));
});

app.post('/api/posts/:id/comments', auth, (req, res) => {
  const content = (req.body.content || '').trim().slice(0, 200);
  if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
  db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)').run(req.params.id, req.user.id, content);
  res.json({ ok: true });
});

// ---------- Discover users ----------
app.get('/api/users', auth, (req, res) => {
  res.json(db.prepare('SELECT id, username FROM users WHERE id != ? ORDER BY id DESC LIMIT 10').all(req.user.id));
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
