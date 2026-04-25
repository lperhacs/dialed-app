const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications/counts — lightweight badge counts (notifications + unread DMs)
router.get('/counts', authMiddleware, (req, res) => {
  const db = getDb();
  const notifications = db.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0'
  ).get(req.user.id).c;

  // Count conversations where the last message was sent by someone else
  // and arrived after the user last read that conversation
  const convIds = db.prepare(
    'SELECT conversation_id, last_read_at FROM conversation_participants WHERE user_id = ?'
  ).all(req.user.id);

  let messages = 0;
  for (const { conversation_id, last_read_at } of convIds) {
    const lastMsg = db.prepare(
      'SELECT sender_id, created_at FROM direct_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(conversation_id);
    if (!lastMsg) continue;
    if (lastMsg.sender_id === req.user.id) continue; // sent by me, not unread
    if (!last_read_at || lastMsg.created_at > last_read_at) messages++;
  }

  res.json({ notifications, messages });
});

// GET /api/notifications
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const notifications = db.prepare(
    `SELECT n.*,
       u.username as from_username, u.display_name as from_display_name, u.avatar_url as from_avatar,
       p.image_url as post_image, p.content as post_content
     FROM notifications n
     LEFT JOIN users u ON u.id = n.from_user_id
     LEFT JOIN posts p ON p.id = n.post_id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC LIMIT 50`
  ).all(req.user.id);

  const unread_count = db.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0'
  ).get(req.user.id).c;

  res.json({ notifications, unread_count });
});

// PUT /api/notifications/read  — mark all as read
router.put('/read', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// POST /api/notifications/habit-reminder  (internal / cron use — requires server secret)
router.post('/habit-reminder', (req, res) => {
  const serverKey = req.headers['x-server-key'];
  if (!serverKey || serverKey !== process.env.SERVER_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const db = getDb();
  // Check which habits haven't been logged today and send nudge
  const { getPeriodKey, isStreakAtRisk } = require('../utils/streaks');

  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? AND is_active = 1').all(req.user.id);
  let nudged = 0;

  for (const habit of habits) {
    const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(habit.id);
    if (isStreakAtRisk(logs, habit.frequency)) {
      const today = getPeriodKey(new Date(), habit.frequency);
      const existing = db.prepare(
        "SELECT 1 FROM notifications WHERE user_id = ? AND type = 'reminder' AND message LIKE ? AND created_at >= date('now', '-1 day')"
      ).get(req.user.id, `%${habit.name}%`);

      if (!existing) {
        db.prepare(
          "INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, 'reminder', ?)"
        ).run(uuidv4(), req.user.id, `Don't break your streak! Log "${habit.name}" before the day ends.`);
        nudged++;
      }
    }
  }

  res.json({ nudged });
});

module.exports = router;
