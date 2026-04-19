const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { calculateStreak } = require('../utils/streaks');

const router = express.Router();

function getUserStreakData(db, userId) {
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? AND is_active = 1').all(userId);
  let maxStreak = 0;
  let totalLogs = 0;

  for (const h of habits) {
    const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(h.id);
    const streak = calculateStreak(logs, h.frequency);
    if (streak > maxStreak) maxStreak = streak;
    totalLogs += logs.length;
  }

  return { max_streak: maxStreak, total_logs: totalLogs, habit_count: habits.length };
}

// GET /api/leaderboard/global
router.get('/global', authMiddleware, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, username, display_name, avatar_url FROM users LIMIT 100'
  ).all();

  const ranked = users
    .map(u => ({ ...u, ...getUserStreakData(db, u.id) }))
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

  // Include self
  const self = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(req.user.id);
  const all = [self, ...friends];

  const ranked = all
    .map(u => ({ ...u, ...getUserStreakData(db, u.id) }))
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

  const ranked = members
    .map(m => {
      const link = db.prepare(
        'SELECT habit_id FROM challenge_habit_links WHERE challenge_id = ? AND user_id = ?'
      ).get(req.params.id, m.id);

      let streak = 0, total_logs = 0;
      if (link) {
        const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(link.habit_id);
        streak = calculateStreak(logs, challenge.frequency);
        total_logs = logs.length;
      }
      return { ...m, streak, total_logs };
    })
    .sort((a, b) => b.streak - a.streak || b.total_logs - a.total_logs)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  res.json({ challenge, members: ranked });
});

// GET /api/leaderboard/challenges  — list all challenges with leaderboard summary
router.get('/challenges', authMiddleware, (req, res) => {
  const db = getDb();
  // Challenges the user is part of
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
