const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { calculateStreak } = require('../utils/streaks');

const router = express.Router();

/**
 * Bulk-fetch streak data for a list of userIds.
 * Uses 2 queries total instead of 2×N queries.
 * Returns a Map: userId → { max_streak, total_logs, habit_count }
 */
function getBulkStreakData(db, userIds) {
  if (!userIds.length) return new Map();

  const placeholders = userIds.map(() => '?').join(',');

  const habits = db.prepare(
    `SELECT id, user_id, frequency, target_count FROM habits WHERE user_id IN (${placeholders}) AND is_active = 1`
  ).all(...userIds);

  if (!habits.length) {
    return new Map(userIds.map(id => [id, { max_streak: 0, total_logs: 0, habit_count: 0 }]));
  }

  const habitIds = habits.map(h => h.id);
  const habitPlaceholders = habitIds.map(() => '?').join(',');

  const logs = db.prepare(
    `SELECT habit_id, logged_at FROM habit_logs WHERE habit_id IN (${habitPlaceholders}) ORDER BY logged_at DESC`
  ).all(...habitIds);

  // Group logs by habit_id
  const logsByHabit = new Map();
  for (const log of logs) {
    if (!logsByHabit.has(log.habit_id)) logsByHabit.set(log.habit_id, []);
    logsByHabit.get(log.habit_id).push(log);
  }

  // Aggregate per user
  const result = new Map(userIds.map(id => [id, { max_streak: 0, total_logs: 0, habit_count: 0 }]));

  for (const habit of habits) {
    const habitLogs = logsByHabit.get(habit.id) || [];
    const streak = calculateStreak(habitLogs, habit.frequency, habit.target_count || 1);
    const entry = result.get(habit.user_id);
    if (streak > entry.max_streak) entry.max_streak = streak;
    entry.total_logs += habitLogs.length;
    entry.habit_count += 1;
  }

  return result;
}

// GET /api/leaderboard/global
router.get('/global', authMiddleware, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, username, display_name, avatar_url FROM users WHERE (is_deactivated IS NULL OR is_deactivated = 0) LIMIT 100'
  ).all();

  const streakMap = getBulkStreakData(db, users.map(u => u.id));

  const ranked = users
    .map(u => ({ ...u, ...streakMap.get(u.id) }))
    .sort((a, b) => b.max_streak - a.max_streak || b.total_logs - a.total_logs)
    .slice(0, 50)
    .map((u, i) => ({ ...u, rank: i + 1 }));

  res.json(ranked);
});

// GET /api/leaderboard/friends
router.get('/friends', authMiddleware, (req, res) => {
  const db = getDb();
  const friends = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM follows f JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = ?`
  ).all(req.user.id);

  const self = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(req.user.id);
  const all = [self, ...friends];

  const streakMap = getBulkStreakData(db, all.map(u => u.id));

  const ranked = all
    .map(u => ({ ...u, ...streakMap.get(u.id) }))
    .sort((a, b) => b.max_streak - a.max_streak || b.total_logs - a.total_logs)
    .map((u, i) => ({ ...u, rank: i + 1 }));

  res.json(ranked);
});

// GET /api/leaderboard/challenges/:id
router.get('/challenges/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

  if (challenge.visibility === 'private') {
    const member = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'").get(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member of this club' });
  }

  const members = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM challenge_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.challenge_id = ?`
  ).all(req.params.id);

  if (!members.length) return res.json({ challenge, members: [] });

  // Fetch all linked habits and logs in bulk
  const memberIds = members.map(m => m.id);
  const placeholders = memberIds.map(() => '?').join(',');
  const links = db.prepare(
    `SELECT user_id, habit_id FROM challenge_habit_links WHERE challenge_id = ? AND user_id IN (${placeholders})`
  ).all(req.params.id, ...memberIds);

  const linkMap = new Map(links.map(l => [l.user_id, l.habit_id]));
  const habitIds = links.map(l => l.habit_id);

  let logsByHabit = new Map();
  if (habitIds.length) {
    const habitPlaceholders = habitIds.map(() => '?').join(',');
    const logs = db.prepare(
      `SELECT habit_id, logged_at FROM habit_logs WHERE habit_id IN (${habitPlaceholders}) ORDER BY logged_at DESC`
    ).all(...habitIds);
    for (const log of logs) {
      if (!logsByHabit.has(log.habit_id)) logsByHabit.set(log.habit_id, []);
      logsByHabit.get(log.habit_id).push(log);
    }
  }

  const ranked = members
    .map(m => {
      const habitId = linkMap.get(m.id);
      const habitLogs = habitId ? (logsByHabit.get(habitId) || []) : [];
      const streak = habitId ? calculateStreak(habitLogs, challenge.frequency) : 0;
      return { ...m, streak, total_logs: habitLogs.length };
    })
    .sort((a, b) => b.streak - a.streak || b.total_logs - a.total_logs)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  res.json({ challenge, members: ranked });
});

// GET /api/leaderboard/challenges  — list all challenges with leaderboard summary
router.get('/challenges', authMiddleware, (req, res) => {
  const db = getDb();
  const challenges = db.prepare(
    `SELECT c.*, u.username, u.display_name,
       (SELECT COUNT(*) FROM challenge_members WHERE challenge_id = c.id) as member_count
     FROM challenge_members cm
     JOIN challenges c ON c.id = cm.challenge_id
     JOIN users u ON u.id = c.creator_id
     WHERE cm.user_id = ?
     ORDER BY c.created_at DESC`
  ).all(req.user.id);

  res.json(challenges);
});

module.exports = router;
