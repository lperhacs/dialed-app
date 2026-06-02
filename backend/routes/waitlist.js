'use strict';
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDb } = require('../database/db');
const { rateLimit } = require('express-rate-limit');

// Throttle the public, unauthenticated signup endpoint so it can't be used to
// flood the DB or amplify the outbound webhook.
const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signups, please try again later.' },
});

// Constant-time compare so the admin key can't be recovered via response timing.
function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Escape a value for safe CSV output. Defends against formula/CSV injection:
// a leading =,+,-,@ (or tab/CR) is neutralized with a leading apostrophe, and
// any field containing a comma, quote, or newline is wrapped in quotes with
// embedded quotes doubled.
function csvField(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// POST /api/waitlist — save a waitlist email from the landing page
router.post('/', waitlistLimiter, (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email required' });
  }
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const db = getDb();
  try {
    db.prepare(
      'INSERT OR IGNORE INTO waitlist (email) VALUES (?)'
    ).run(normalized);
  } catch (err) {
    console.error('[Waitlist] insert failed:', err.message);
    return res.status(500).json({ error: 'Could not save email' });
  }

  // Optional: forward to a Zapier/Make webhook for Google Sheets sync
  const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized, signed_up_at: new Date().toISOString() }),
    }).catch(err => console.warn('[Waitlist] webhook failed:', err.message));
  }

  res.json({ ok: true });
});

// GET /api/waitlist/export.csv — download all waitlist emails as CSV
// Protected by x-analytics-key header (same key used for JS error admin endpoint)
router.get('/export.csv', (req, res) => {
  const adminKey = process.env.ANALYTICS_KEY;
  if (!adminKey) return res.status(503).json({ error: 'Export not configured' });
  if (!timingSafeStringEqual(req.headers['x-analytics-key'], adminKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const rows = db.prepare('SELECT email, created_at FROM waitlist ORDER BY created_at ASC').all();

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="waitlist.csv"');
  res.send('email,signed_up_at\n' + rows.map(r => `${csvField(r.email)},${csvField(r.created_at)}`).join('\n'));
});

// GET /api/waitlist/count — public count for social proof display
router.get('/count', (_req, res) => {
  const db = getDb();
  const { count } = db.prepare('SELECT COUNT(*) as count FROM waitlist').get();
  res.json({ count });
});

module.exports = router;
