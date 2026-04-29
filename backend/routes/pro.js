const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { trackEvent, metaFromReq } = require('../utils/analytics');

const router = express.Router();

// GET /api/pro/status
router.get('/status', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT is_pro, pro_expires_at, streak_freezes FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Auto-expire pro if past expiry date
  if (user.is_pro && user.pro_expires_at && new Date() > new Date(user.pro_expires_at)) {
    db.prepare('UPDATE users SET is_pro = 0 WHERE id = ?').run(req.user.id);
    user.is_pro = 0;
  }

  res.json({
    is_pro: !!user.is_pro,
    pro_expires_at: user.pro_expires_at,
    streak_freezes: user.streak_freezes || 0,
  });
});

// POST /api/pro/grant — called by RevenueCat webhook or dev testing
// Requires server-to-server key: Authorization: Bearer <PRO_SERVER_KEY>
router.post('/grant', (req, res) => {
  const key = (req.headers.authorization || '').replace('Bearer ', '');
  if (!process.env.PRO_SERVER_KEY || key !== process.env.PRO_SERVER_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { user_id, plan } = req.body; // plan: 'monthly' | 'annual'
  if (!user_id || !['monthly', 'annual'].includes(plan)) {
    return res.status(400).json({ error: 'user_id and plan required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const now = new Date();
  const expiresAt = plan === 'annual'
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString()
    : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();

  // Grant 3 streak freezes per grant (monthly refresh handled by billing cycle)
  db.prepare(
    'UPDATE users SET is_pro = 1, pro_expires_at = ?, streak_freezes = 3 WHERE id = ?'
  ).run(expiresAt, user_id);

  trackEvent(user_id, 'pro_granted', { plan }, {});
  res.json({ granted: true, expires_at: expiresAt });
});

// POST /api/pro/use-freeze — spend a streak freeze on a habit
router.post('/use-freeze', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT is_pro, streak_freezes FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.is_pro) return res.status(403).json({ error: 'Dialed Pro required', pro_gate: true });
  if (user.streak_freezes < 1) return res.status(400).json({ error: 'No streak freezes remaining' });

  const { habit_id } = req.body;
  if (!habit_id) return res.status(400).json({ error: 'habit_id required' });

  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(habit_id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  // Insert a backdated log for yesterday to preserve streak
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const { v4: uuidv4 } = require('uuid');
  db.prepare(
    "INSERT INTO habit_logs (id, habit_id, user_id, note, logged_at) VALUES (?, ?, ?, '[freeze]', ?)"
  ).run(uuidv4(), habit_id, req.user.id, yesterday.toISOString());

  db.prepare('UPDATE users SET streak_freezes = streak_freezes - 1 WHERE id = ?').run(req.user.id);

  const remaining = user.streak_freezes - 1;
  trackEvent(req.user.id, 'streak_freeze_used', { habit_id }, metaFromReq(req));
  res.json({ used: true, freezes_remaining: remaining });
});

module.exports = router;
