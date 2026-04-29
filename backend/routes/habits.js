const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { calculateStreak, isStreakAtRisk, buildStreakCalendar, getEarnedBadges, getPeriodKeyTz } = require('../utils/streaks');
const { trackEvent, metaFromReq } = require('../utils/analytics');

const router = express.Router();

function awardBadges(db, userId, habitId) {
  const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(habitId);
  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(habitId);
  if (!habit) return;

  const streak = calculateStreak(logs, habit.frequency, habit.target_count || 1);
  const totalLogs = logs.length;
  const earned = getEarnedBadges(streak, totalLogs, habit.frequency);

  for (const badge of earned) {
    const exists = db.prepare('SELECT 1 FROM badges WHERE user_id = ? AND badge_type = ?').get(userId, badge.type);
    if (!exists) {
      db.prepare('INSERT OR IGNORE INTO badges (id, user_id, badge_type, habit_id) VALUES (?, ?, ?, ?)').run(uuidv4(), userId, badge.type, habitId);

      db.prepare(
        "INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, 'badge', ?)"
      ).run(uuidv4(), userId, `You earned the "${badge.label}" badge! ${badge.icon}`);
    }
  }
}

// GET /api/habits — my habits
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

  const tz = req.headers['x-client-timezone'] || null;
  const enriched = habits.map(h => {
    const target = h.target_count || 1;
    const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(h.id);
    const streak = calculateStreak(logs, h.frequency, target);
    const at_risk = isStreakAtRisk(logs, h.frequency, target);
    const total_logs = logs.length;
    const calendar = buildStreakCalendar(logs, h.frequency, target, 365);
    const currentPeriod = getPeriodKeyTz(new Date(), h.frequency, tz);
    const period_count = logs.filter(l => getPeriodKeyTz(l.logged_at, h.frequency, tz) === currentPeriod).length;
    const logged_this_period = period_count > 0;
    return { ...h, streak, at_risk, total_logs, calendar, period_count, logged_this_period };
  });

  res.json(enriched);
});

const FREE_HABIT_LIMIT = 5;

// POST /api/habits
router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, description, frequency, visibility_missed, color, reminder_time, target_count } = req.body;

  // Free plan gate — max 5 active habits
  const user = db.prepare('SELECT is_pro FROM users WHERE id = ?').get(req.user.id);
  if (!user?.is_pro) {
    const habitCount = db.prepare('SELECT COUNT(*) as c FROM habits WHERE user_id = ? AND is_active = 1').get(req.user.id).c;
    if (habitCount >= FREE_HABIT_LIMIT) {
      return res.status(403).json({ error: `Free plan is limited to ${FREE_HABIT_LIMIT} habits. Upgrade to Dialed Pro for unlimited habits.`, pro_gate: true });
    }
  }

  if (!name || !frequency) return res.status(400).json({ error: 'Name and frequency are required' });
  if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
    return res.status(400).json({ error: 'Invalid frequency' });
  }
  if (name.trim().length > 100) return res.status(400).json({ error: 'Habit name must be 100 characters or fewer' });
  if (description && description.length > 500) return res.status(400).json({ error: 'Description must be 500 characters or fewer' });
  if (visibility_missed && !['public', 'friends', 'private'].includes(visibility_missed)) {
    return res.status(400).json({ error: 'Invalid visibility' });
  }
  const maxTarget = frequency === 'weekly' ? 7 : frequency === 'monthly' ? 28 : 1;
  const resolvedTarget = frequency === 'daily' ? 1 : Math.min(Math.max(parseInt(target_count) || 1, 1), maxTarget);

  const id = uuidv4();
  db.prepare(
    'INSERT INTO habits (id, user_id, name, description, frequency, visibility_missed, color, reminder_time, target_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user.id, name.trim(), description?.trim() || '', frequency, visibility_missed || 'public', color || '#f97316', reminder_time || null, resolvedTarget);

  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
  trackEvent(req.user.id, 'habit_created', { frequency, color: color || '#f97316', target_count: resolvedTarget }, metaFromReq(req));
  res.status(201).json({ ...habit, streak: 0, at_risk: false, total_logs: 0, calendar: [], period_count: 0 });
});

// GET /api/habits/:id
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  const logs = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(habit.id);
  const streak = calculateStreak(logs, habit.frequency, habit.target_count || 1);
  const at_risk = isStreakAtRisk(logs, habit.frequency);
  const calendar = buildStreakCalendar(logs, habit.frequency, 365);

  res.json({ ...habit, streak, at_risk, total_logs: logs.length, calendar, recent_logs: logs.slice(0, 10) });
});

// PUT /api/habits/:id
router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  const { name, description, frequency, visibility_missed, color, is_active, reminder_time, target_count } = req.body;
  if (frequency && !['daily', 'weekly', 'monthly'].includes(frequency)) {
    return res.status(400).json({ error: 'Invalid frequency' });
  }
  if (visibility_missed && !['public', 'friends', 'private'].includes(visibility_missed)) {
    return res.status(400).json({ error: 'Invalid visibility' });
  }
  if (name && name.trim().length > 100) return res.status(400).json({ error: 'Habit name must be 100 characters or fewer' });
  if (description && description.length > 500) return res.status(400).json({ error: 'Description must be 500 characters or fewer' });

  const resolvedFreq = frequency || habit.frequency;
  const maxTarget = resolvedFreq === 'weekly' ? 7 : resolvedFreq === 'monthly' ? 28 : 1;
  const resolvedTarget = target_count !== undefined
    ? (resolvedFreq === 'daily' ? 1 : Math.min(Math.max(parseInt(target_count) || 1, 1), maxTarget))
    : null;

  db.prepare(
    `UPDATE habits SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      frequency = COALESCE(?, frequency),
      visibility_missed = COALESCE(?, visibility_missed),
      color = COALESCE(?, color),
      is_active = COALESCE(?, is_active),
      reminder_time = ?,
      target_count = COALESCE(?, target_count)
    WHERE id = ?`
  ).run(name, description, frequency, visibility_missed, color, is_active !== undefined ? (is_active ? 1 : 0) : null, reminder_time !== undefined ? (reminder_time || null) : db.prepare('SELECT reminder_time FROM habits WHERE id = ?').get(req.params.id)?.reminder_time, resolvedTarget, req.params.id);

  const updated = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/habits/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });
  db.prepare('DELETE FROM habits WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// POST /api/habits/:id/log
router.post('/:id/log', authMiddleware, (req, res) => {
  const db = getDb();
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  const { note, logged_at: loggedAtOverride } = req.body;

  // Validate and restrict backdating — max 48 hours in the past, no future dates
  if (loggedAtOverride) {
    const override = new Date(loggedAtOverride);
    if (isNaN(override.getTime())) {
      return res.status(400).json({ error: 'Invalid logged_at date' });
    }
    const now = new Date();
    const maxBackdate = new Date(now - 48 * 60 * 60 * 1000);
    if (override > now) {
      return res.status(400).json({ error: 'Cannot log habits in the future' });
    }
    if (override < maxBackdate) {
      return res.status(400).json({ error: 'Cannot backdate logs more than 48 hours' });
    }
  }

  // Prevent double-logging same period (uses client timezone so resets at user's midnight)
  const tz = req.headers['x-client-timezone'] || null;
  const logDate = loggedAtOverride ? new Date(loggedAtOverride) : new Date();
  const today = getPeriodKeyTz(logDate, habit.frequency, tz);
  const lookback = habit.frequency === 'monthly' ? '-32 days' : habit.frequency === 'weekly' ? '-8 days' : '-2 days';
  const recentLogs = db.prepare(
    `SELECT logged_at FROM habit_logs WHERE habit_id = ? AND logged_at >= date('now', '${lookback}')`
  ).all(habit.id);

  const target = habit.target_count || 1;
  const periodCount = recentLogs.filter(l => getPeriodKeyTz(l.logged_at, habit.frequency, tz) === today).length;
  if (periodCount >= target) {
    return res.status(400).json({ error: target > 1 ? `Goal reached! You've already logged ${target}x this period.` : 'Already logged this period' });
  }

  const id = uuidv4();
  if (loggedAtOverride) {
    db.prepare('INSERT INTO habit_logs (id, habit_id, user_id, note, logged_at) VALUES (?, ?, ?, ?, ?)').run(id, habit.id, req.user.id, note || '', loggedAtOverride);
  } else {
    db.prepare('INSERT INTO habit_logs (id, habit_id, user_id, note) VALUES (?, ?, ?, ?)').run(id, habit.id, req.user.id, note || '');
  }

  // Award badges
  awardBadges(db, req.user.id, habit.id);

  const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(habit.id);
  const streak = calculateStreak(logs, habit.frequency, target);
  const at_risk = isStreakAtRisk(logs, habit.frequency, target);
  const newPeriodCount = periodCount + 1;
  const goalJustMet = newPeriodCount >= target;

  const MILESTONES = { 7: 'First Week', 30: 'One Month', 100: '100 Days', 365: 'One Year' };
  const milestone = goalJustMet && MILESTONES[streak] ? { day: streak, label: MILESTONES[streak] } : null;

  trackEvent(req.user.id, 'habit_logged', {
    frequency: habit.frequency,
    streak,
    goal_met: goalJustMet,
    milestone: milestone ? milestone.label : null,
  }, metaFromReq(req));

  res.status(201).json({ logged: true, streak, at_risk, total_logs: logs.length, period_count: newPeriodCount, target_count: target, goal_met: goalJustMet, milestone });
});

// GET /api/habits/:id/logs
router.get('/:id/logs', authMiddleware, (req, res) => {
  const db = getDb();
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  const logs = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC LIMIT 100').all(habit.id);
  res.json(logs);
});

module.exports = router;
