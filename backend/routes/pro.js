const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { trackEvent, metaFromReq } = require('../utils/analytics');

// Return a Date representing yesterday at noon in the client's timezone.
// Falls back to UTC if the timezone header is missing or invalid.
function localYesterday(tz) {
  try {
    const now = new Date();
    // Get today's date string in the user's timezone (en-CA gives YYYY-MM-DD)
    const todayLocal = now.toLocaleDateString('en-CA', { timeZone: tz || 'UTC' });
    const [y, m, d] = todayLocal.split('-').map(Number);
    // Subtract one day
    const yest = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
    return yest;
  } catch (_) {
    const y = new Date();
    y.setUTCDate(y.getUTCDate() - 1);
    y.setUTCHours(12, 0, 0, 0);
    return y;
  }
}

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

  // Insert a backdated log for yesterday (in the user's local timezone) to preserve streak
  const { v4: uuidv4 } = require('uuid');
  const tz = req.headers['x-client-timezone'];
  const yesterday = localYesterday(tz);
  db.prepare(
    "INSERT INTO habit_logs (id, habit_id, user_id, note, logged_at) VALUES (?, ?, ?, '[freeze]', ?)"
  ).run(uuidv4(), habit_id, req.user.id, yesterday.toISOString());

  db.prepare('UPDATE users SET streak_freezes = streak_freezes - 1 WHERE id = ?').run(req.user.id);

  const remaining = user.streak_freezes - 1;
  trackEvent(req.user.id, 'streak_freeze_used', { habit_id }, metaFromReq(req));
  res.json({ used: true, freezes_remaining: remaining });
});

// POST /api/pro/restore-streak — restore a recently broken streak (≤3 missed periods)
// Costs 1 streak freeze. Works for daily (≤3 days), weekly (≤2 weeks), monthly (≤1 month).
router.post('/restore-streak', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT is_pro, streak_freezes FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.is_pro) return res.status(403).json({ error: 'Dialed Pro required', pro_gate: true });
  if (user.streak_freezes < 1) return res.status(400).json({ error: 'No streak freezes remaining' });

  const { habit_id } = req.body;
  if (!habit_id) return res.status(400).json({ error: 'habit_id required' });

  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(habit_id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  // Find the last logged date
  const lastLog = db.prepare(
    "SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC LIMIT 1"
  ).get(habit_id);
  if (!lastLog) return res.status(400).json({ error: 'No logs to restore from' });

  const { getPeriodKey } = require('../utils/streaks');
  const { v4: uuidv4 } = require('uuid');
  const tz = req.headers['x-client-timezone'];

  // Get today's date string in user's local timezone
  const now = new Date();
  const todayLocal = now.toLocaleDateString('en-CA', { timeZone: tz || 'UTC' });
  const lastLocal = new Date(lastLog.logged_at).toLocaleDateString('en-CA', { timeZone: tz || 'UTC' });

  const RESTORATION_LIMITS = { daily: 3, weekly: 2, monthly: 1 };
  const maxMissed = RESTORATION_LIMITS[habit.frequency] || 3;

  let missedDates = [];

  if (habit.frequency === 'daily') {
    // Parse local date strings to get day counts
    const [ty, tm, td] = todayLocal.split('-').map(Number);
    const [ly, lm, ld] = lastLocal.split('-').map(Number);
    const todayUtcMidnight = Date.UTC(ty, tm - 1, td);
    const lastUtcMidnight = Date.UTC(ly, lm - 1, ld);
    const daysSince = Math.round((todayUtcMidnight - lastUtcMidnight) / 86400000);
    if (daysSince < 1) return res.status(400).json({ error: 'Streak is not broken' });
    if (daysSince - 1 > maxMissed) return res.status(400).json({ error: `Streak can only be restored if broken within ${maxMissed} days` });
    // Fill each missed day (not today — user should log today themselves)
    for (let d = daysSince - 1; d >= 1; d--) {
      const missed = new Date(Date.UTC(ty, tm - 1, td - d, 12, 0, 0));
      missedDates.push(missed.toISOString());
    }
    // Fill yesterday if not already included
    const yest = new Date(Date.UTC(ty, tm - 1, td - 1, 12, 0, 0));
    const yestKey = yest.toISOString().slice(0, 10);
    if (!missedDates.find(d => d.slice(0, 10) === yestKey)) {
      missedDates.push(yest.toISOString());
    }
  } else if (habit.frequency === 'weekly') {
    // Count missed ISO weeks between last log and today
    const currentWeek = getPeriodKey(now, 'weekly');
    const lastWeek = getPeriodKey(new Date(lastLog.logged_at), 'weekly');
    if (currentWeek === lastWeek) return res.status(400).json({ error: 'Streak is not broken' });
    // Walk back week by week from last week before current, filling missed ones
    let check = new Date(now);
    check.setUTCDate(check.getUTCDate() - 7); // start from last week
    const missedWeeks = [];
    while (true) {
      const wk = getPeriodKey(check, 'weekly');
      if (wk === lastWeek) break;
      missedWeeks.push(new Date(check));
      check.setUTCDate(check.getUTCDate() - 7);
      if (missedWeeks.length > 10) break; // safety guard
    }
    if (missedWeeks.length === 0) return res.status(400).json({ error: 'Streak is not broken' });
    if (missedWeeks.length > maxMissed) return res.status(400).json({ error: `Streak can only be restored if broken within ${maxMissed} weeks` });
    for (const d of missedWeeks) {
      d.setUTCHours(12, 0, 0, 0);
      missedDates.push(d.toISOString());
    }
  } else if (habit.frequency === 'monthly') {
    const [ty, tm] = todayLocal.split('-').map(Number);
    const [ly, lm] = lastLocal.split('-').map(Number);
    const monthsSince = (ty - ly) * 12 + (tm - lm);
    if (monthsSince < 1) return res.status(400).json({ error: 'Streak is not broken' });
    if (monthsSince - 1 > maxMissed) return res.status(400).json({ error: `Streak can only be restored if broken within ${maxMissed} months` });
    for (let m = monthsSince; m >= 1; m--) {
      // Use the 15th at noon UTC for the missed month
      const missed = new Date(Date.UTC(ty, tm - 1 - m, 15, 12, 0, 0));
      missedDates.push(missed.toISOString());
    }
  }

  if (!missedDates.length) return res.status(400).json({ error: 'Nothing to restore' });

  // Insert restore logs for each missed period
  const insertLog = db.prepare(
    "INSERT OR IGNORE INTO habit_logs (id, habit_id, user_id, note, logged_at) VALUES (?, ?, ?, '[restore]', ?)"
  );
  for (const date of missedDates) {
    insertLog.run(uuidv4(), habit_id, req.user.id, date);
  }

  db.prepare('UPDATE users SET streak_freezes = streak_freezes - 1 WHERE id = ?').run(req.user.id);

  const remaining = user.streak_freezes - 1;
  trackEvent(req.user.id, 'streak_restored', { habit_id, missed: missedDates.length }, metaFromReq(req));
  res.json({ restored: true, periods_filled: missedDates.length, freezes_remaining: remaining });
});

module.exports = router;
