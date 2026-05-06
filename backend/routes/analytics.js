const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { analyticsLimiter, jsErrorLimiter } = require('../middleware/rateLimits');

const router = express.Router();

// Constant-time compare prevents timing-attack discovery of ANALYTICS_KEY.
function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// POST /api/analytics/jserror — capture JS errors from the mobile app's
// global error handler. Auth is OPTIONAL (the app may crash before/without
// a session, and we want every error captured) — but when a valid token IS
// provided we tie the error to req.user.id rather than trusting the body.
// Never trust client-supplied user_id: it could be spoofed to attribute
// errors to another user and mask the actual offender.
router.post('/jserror', jsErrorLimiter, optionalAuth, (req, res) => {
  try {
    const { message, stack, is_fatal, platform, app_version, os_version } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message required' });
    }
    const db = getDb();
    db.prepare(`
      INSERT INTO js_errors (id, user_id, message, stack, is_fatal, platform, app_version, os_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      req.user?.id || null,
      String(message).slice(0, 1000),
      typeof stack === 'string' ? stack.slice(0, 8000) : '',
      is_fatal ? 1 : 0,
      typeof platform === 'string' ? platform.slice(0, 32) : null,
      typeof app_version === 'string' ? app_version.slice(0, 32) : null,
      typeof os_version === 'string' ? os_version.slice(0, 32) : null,
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[jserror] insert failed:', err);
    res.status(500).json({ error: 'logging failed' });
  }
});

// Simple admin key guard — set ANALYTICS_KEY in Railway env vars
function adminOnly(req, res, next) {
  const key = process.env.ANALYTICS_KEY;
  if (!key) return res.status(503).json({ error: 'Analytics not configured' });
  if (!timingSafeStringEqual(req.headers['x-analytics-key'], key)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/analytics/summary
// Returns aggregate counts + breakdowns. No raw PII ever returned.
router.get('/summary', analyticsLimiter, adminOnly, (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Total users
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const newUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE created_at >= ?').get(since).c;

  // DAU (distinct users with any event in last 1 day)
  const dau = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= datetime('now', '-1 day') AND user_id IS NOT NULL"
  ).get().c;

  // WAU
  const wau = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= datetime('now', '-7 days') AND user_id IS NOT NULL"
  ).get().c;

  // MAU
  const mau = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= datetime('now', '-30 days') AND user_id IS NOT NULL"
  ).get().c;

  // Event counts in window
  const eventCounts = db.prepare(
    'SELECT event_name, COUNT(*) as count FROM analytics_events WHERE created_at >= ? GROUP BY event_name ORDER BY count DESC'
  ).all(since);

  // Habit frequency distribution
  const habitsByFreq = db.prepare(
    "SELECT frequency, COUNT(*) as count FROM habits GROUP BY frequency"
  ).all();

  // Top habit names (anonymized — name only, no user linkage)
  const topHabitNames = db.prepare(
    "SELECT name, COUNT(*) as count FROM habits GROUP BY lower(trim(name)) ORDER BY count DESC LIMIT 20"
  ).all();

  // Platform breakdown from events
  const platforms = db.prepare(
    'SELECT platform, COUNT(*) as count FROM analytics_events WHERE created_at >= ? AND platform IS NOT NULL GROUP BY platform'
  ).all(since);

  // Daily new user trend (last 14 days)
  const userTrend = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM users
    WHERE created_at >= date('now', '-14 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  // Daily event volume trend
  const eventTrend = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM analytics_events
    WHERE created_at >= date('now', '-14 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  // Habit logs per day (engagement signal)
  const logTrend = db.prepare(`
    SELECT date(logged_at) as day, COUNT(*) as count
    FROM habit_logs
    WHERE logged_at >= date('now', '-14 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  // Retention proxy: users who logged a habit today who also logged 7 days ago
  const retainedUsers = db.prepare(`
    SELECT COUNT(DISTINCT a.user_id) as c
    FROM habit_logs a
    JOIN habit_logs b ON a.user_id = b.user_id
    WHERE date(a.logged_at) = date('now')
      AND date(b.logged_at) = date('now', '-7 days')
  `).get().c;

  res.json({
    window_days: days,
    users: { total: totalUsers, new_in_window: newUsers, dau, wau, mau },
    retention: { retained_d7: retainedUsers },
    platforms,
    event_counts: eventCounts,
    habits: { by_frequency: habitsByFreq, top_names: topHabitNames },
    trends: { users: userTrend, events: eventTrend, habit_logs: logTrend },
  });
});

// GET /api/analytics/funnel  — registration → first habit → first log → first post
router.get('/funnel', analyticsLimiter, adminOnly, (req, res) => {
  const db = getDb();

  const registered = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

  const createdHabit = db.prepare(
    'SELECT COUNT(DISTINCT user_id) as c FROM habits'
  ).get().c;

  const loggedHabit = db.prepare(
    'SELECT COUNT(DISTINCT user_id) as c FROM habit_logs'
  ).get().c;

  const postedContent = db.prepare(
    'SELECT COUNT(DISTINCT user_id) as c FROM posts'
  ).get().c;

  const followedSomeone = db.prepare(
    'SELECT COUNT(DISTINCT follower_id) as c FROM follows'
  ).get().c;

  res.json({
    funnel: [
      { step: 'Registered', count: registered },
      { step: 'Created first habit', count: createdHabit },
      { step: 'Logged first habit', count: loggedHabit },
      { step: 'Made first post', count: postedContent },
      { step: 'Followed someone', count: followedSomeone },
    ],
  });
});

// GET /api/analytics/jserrors — admin view of recent JS errors
router.get('/jserrors', analyticsLimiter, adminOnly, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const errors = db.prepare(`
    SELECT id, user_id, message, stack, is_fatal, platform, app_version, os_version, created_at
    FROM js_errors
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
  res.json({ errors });
});

module.exports = router;
