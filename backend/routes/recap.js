const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { calculateStreak } = require('../utils/streaks');

const router = express.Router();

// GET /api/recap/weekly
router.get('/weekly', authMiddleware, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  // Week bounds: Monday–Sunday
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStart = monday.toISOString().split('T')[0];
  const weekEnd = sunday.toISOString().split('T')[0];

  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? AND is_active = 1').all(userId);

  const habitSummary = habits.map(h => {
    const logsThisWeek = db.prepare(
      "SELECT COUNT(*) as c FROM habit_logs WHERE habit_id = ? AND date(logged_at) >= ? AND date(logged_at) <= ?"
    ).get(h.id, weekStart, weekEnd).c;

    const allLogs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(h.id);
    const streak = calculateStreak(allLogs, h.frequency);
    const expected = h.frequency === 'daily' ? 7 : 1;

    return {
      habit_id: h.id,
      habit_name: h.name,
      habit_color: h.color,
      frequency: h.frequency,
      logs_this_week: logsThisWeek,
      expected_this_week: expected,
      streak,
      completed: logsThisWeek >= 1,
    };
  });

  const total_logs = db.prepare(
    "SELECT COUNT(*) as c FROM habit_logs WHERE user_id = ? AND date(logged_at) >= ? AND date(logged_at) <= ?"
  ).get(userId, weekStart, weekEnd).c;

  const total_cheers = db.prepare(
    `SELECT COUNT(*) as c FROM cheers ch
     JOIN posts p ON p.id = ch.post_id
     WHERE p.user_id = ? AND date(ch.created_at) >= ? AND date(ch.created_at) <= ?`
  ).get(userId, weekStart, weekEnd).c;

  const total_likes = db.prepare(
    `SELECT COUNT(*) as c FROM likes l
     JOIN posts p ON p.id = l.post_id
     WHERE p.user_id = ? AND date(l.created_at) >= ? AND date(l.created_at) <= ?`
  ).get(userId, weekStart, weekEnd).c;

  const streaks_maintained = habitSummary.filter(h => h.streak > 0).length;
  const habits_completed = habitSummary.filter(h => h.completed).length;

  const total_expected = habitSummary.reduce((s, h) => s + h.expected_this_week, 0);
  const completion_rate = total_expected > 0
    ? Math.min(100, Math.round((total_logs / total_expected) * 100))
    : 0;

  res.json({
    week_start: weekStart,
    week_end: weekEnd,
    habits: habitSummary,
    total_logs,
    total_cheers,
    total_likes,
    streaks_maintained,
    habits_completed,
    habit_count: habits.length,
    completion_rate,
  });
});

module.exports = router;
