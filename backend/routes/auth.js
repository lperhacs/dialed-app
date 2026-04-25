const express = require('express');
const bcrypt = require('bcryptjs');
const { randomInt } = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, email, password, display_name } = req.body;
  if (!username || !email || !password || !display_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (display_name.trim().length < 1 || display_name.trim().length > 50) {
    return res.status(400).json({ error: 'Display name must be 1-50 characters' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already taken' });
  }

  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (id, username, email, password_hash, display_name) VALUES (?, ?, ?, ?, ?)'
  ).run(id, username.toLowerCase(), email.toLowerCase(), password_hash, display_name);

  const user = db.prepare('SELECT id, username, email, display_name, bio, avatar_url, created_at FROM users WHERE id = ?').get(id);
  const token = generateToken(user);
  res.status(201).json({ token, user });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(
    username.toLowerCase(),
    username.toLowerCase()
  );

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { password_hash: _, ...safeUser } = user;
  const token = generateToken(safeUser);
  res.json({ token, user: safeUser });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, email, display_name, bio, avatar_url, location, rsvp_private, created_at FROM users WHERE id = ?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  const followerCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(req.user.id).c;
  const followingCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(req.user.id).c;

  res.json({ ...user, follower_count: followerCount, following_count: followingCount });
});

// ── OTP (SMS verification placeholder — swap Twilio in for production) ────────
// In-memory store: phone → { otp, expires, attempts }. Use Redis/DB in production.
const otpStore = new Map();
const OTP_MAX_ATTEMPTS = 5;

// POST /api/auth/send-otp
router.post('/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Valid phone number required' });
  }
  const cleaned = phone.replace(/\D/g, '');
  const otp = randomInt(100000, 1000000).toString();
  otpStore.set(cleaned, { otp, expires: Date.now() + 10 * 60 * 1000, attempts: 0 });

  // TODO: replace with Twilio SMS — `twilio.messages.create({ to: cleaned, from: TWILIO_FROM, body: ... })`

  res.json({ sent: true });
});

// POST /api/auth/verify-otp  (requires auth — user already registered by this point)
router.post('/verify-otp', authMiddleware, (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and code required' });

  const cleaned = phone.replace(/\D/g, '');
  const record = otpStore.get(cleaned);

  if (!record || Date.now() > record.expires) {
    otpStore.delete(cleaned);
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  record.attempts += 1;
  if (record.attempts > OTP_MAX_ATTEMPTS) {
    otpStore.delete(cleaned);
    return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
  }

  if (record.otp !== otp.toString()) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }
  otpStore.delete(cleaned);

  // Return a handful of suggested users to follow (contact-matched users would be filtered here
  // once phone numbers are stored on user profiles)
  const db = getDb();
  const suggested = db.prepare(`
    SELECT id, username, display_name, avatar_url FROM users
    WHERE id != ?
    ORDER BY created_at DESC LIMIT 10
  `).all(req.user.id);

  res.json({ verified: true, suggested });
});

module.exports = router;
