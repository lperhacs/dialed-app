const express = require('express');
const bcrypt = require('bcryptjs');
const { randomInt } = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { trackEvent, metaFromReq } = require('../utils/analytics');
const { sendVerificationEmail } = require('../utils/email');

// Monthly email budget — hard stop before hitting Resend free tier limit
const MONTHLY_EMAIL_CAP = 50000;

// Common disposable/throwaway email domains to block
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','guerrillamail.com','throwaway.email','trashmail.com',
  'tempmail.com','temp-mail.org','fakeinbox.com','maildrop.cc','sharklasers.com',
  'guerrillamailblock.com','grr.la','guerrillamail.info','guerrillamail.biz',
  'guerrillamail.de','guerrillamail.net','guerrillamail.org','spam4.me',
  'yopmail.com','yopmail.fr','cool.fr.nf','jetable.fr.nf','nospam.ze.tc',
  'nomail.xl.cx','mega.zik.dj','speed.1s.fr','courriel.fr.nf','moncourrier.fr.nf',
  'monemail.fr.nf','monmail.fr.nf','dispostable.com','mailnull.com','spamgourmet.com',
  'trashmail.at','trashmail.io','trashmail.me','discard.email','spamfree24.org',
  'wegwerfmail.de','wegwerfmail.net','wegwerfmail.org','10minutemail.com',
  'tempinbox.com','throwam.com','spamherelots.com','binkmail.com','bob.email',
]);

function isDisposableEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

function monthlyEmailBudgetExceeded(db) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const { c } = db.prepare(
    "SELECT COUNT(*) as c FROM email_verifications WHERE strftime('%Y-%m', created_at) = ?"
  ).get(month);
  return c >= MONTHLY_EMAIL_CAP;
}

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
  if (isDisposableEmail(email)) {
    return res.status(400).json({ error: 'Please use a permanent email address.' });
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
  trackEvent(id, 'user_registered', {}, metaFromReq(req));

  // Send verification email (non-blocking — don't fail registration if email fails)
  if (monthlyEmailBudgetExceeded(db)) {
    console.warn('[Email] Monthly cap reached — skipping verification email for', email.toLowerCase());
    return res.status(201).json({ token, user });
  }
  const verifyCode = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(id);
  db.prepare('INSERT INTO email_verifications (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)').run(uuidv4(), id, verifyCode, expiresAt);
  sendVerificationEmail(email.toLowerCase(), verifyCode).catch(err => console.error('[Email] verification send failed:', err));

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
  trackEvent(safeUser.id, 'user_login', {}, metaFromReq(req));
  res.json({ token, user: safeUser });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, email, display_name, bio, avatar_url, location, rsvp_private, buddy_visibility, email_verified, is_pro, streak_freezes, pro_expires_at, created_at FROM users WHERE id = ?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  const followerCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(req.user.id).c;
  const followingCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(req.user.id).c;

  res.json({ ...user, follower_count: followerCount, following_count: followingCount });
});

// POST /api/auth/resend-verification — resend email verification code
router.post('/resend-verification', authMiddleware, async (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, email_verified FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.email_verified) return res.status(400).json({ error: 'Email already verified' });
  if (monthlyEmailBudgetExceeded(db)) {
    return res.status(503).json({ error: 'Email service temporarily unavailable. Please try again later.' });
  }

  // Rate limit: max 1 resend per 60 seconds
  const recent = db.prepare(
    "SELECT created_at FROM email_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(req.user.id);
  if (recent && new Date() - new Date(recent.created_at) < 60000) {
    return res.status(429).json({ error: 'Please wait a minute before requesting another code.' });
  }

  const code = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(req.user.id);
  db.prepare('INSERT INTO email_verifications (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)').run(uuidv4(), req.user.id, code, expiresAt);

  try {
    await sendVerificationEmail(user.email, code);
    res.json({ sent: true });
  } catch (err) {
    console.error('[Email] resend failed:', err);
    res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', authMiddleware, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const db = getDb();
  const record = db.prepare(
    'SELECT * FROM email_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(req.user.id);

  if (!record || new Date() > new Date(record.expires_at)) {
    db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(req.user.id);
    return res.status(400).json({ error: 'Code expired. Please request a new one.' });
  }

  if (record.code !== code.toString().trim()) {
    return res.status(400).json({ error: 'Incorrect code.' });
  }

  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(req.user.id);
  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(req.user.id);

  const user = db.prepare('SELECT id, username, email, display_name, bio, avatar_url, email_verified, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ verified: true, user });
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
