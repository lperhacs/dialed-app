'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

// POST /api/waitlist — save a waitlist email from the landing page
router.post('/', (req, res) => {
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
  const key = req.headers['x-analytics-key'];
  if (!key || key !== process.env.ANALYTICS_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const rows = db.prepare('SELECT email, created_at FROM waitlist ORDER BY created_at ASC').all();

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="waitlist.csv"');
  res.send('email,signed_up_at\n' + rows.map(r => `${r.email},${r.created_at}`).join('\n'));
});

// GET /api/waitlist/count — public count for social proof display
router.get('/count', (_req, res) => {
  const db = getDb();
  const { count } = db.prepare('SELECT COUNT(*) as count FROM waitlist').get();
  res.json({ count });
});

module.exports = router;
