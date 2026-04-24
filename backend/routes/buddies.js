const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { sendPush } = require('../utils/push');

const router = express.Router();

function getActiveBuddy(db, userId) {
  return db.prepare(`
    SELECT b.*,
      CASE WHEN b.requester_id = ? THEN b.recipient_id ELSE b.requester_id END as buddy_user_id,
      u.username as buddy_username,
      u.display_name as buddy_display_name,
      u.avatar_url as buddy_avatar_url
    FROM buddies b
    JOIN users u ON u.id = CASE WHEN b.requester_id = ? THEN b.recipient_id ELSE b.requester_id END
    WHERE (b.requester_id = ? OR b.recipient_id = ?) AND b.status = 'active'
    LIMIT 1
  `).get(userId, userId, userId, userId);
}

// GET /api/buddies — current buddy pair + habit status
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const buddy = getActiveBuddy(db, userId);

  const pending = db.prepare(`
    SELECT b.id, b.requester_id, u.username as from_username, u.display_name as from_display_name, u.avatar_url as from_avatar
    FROM buddies b
    JOIN users u ON u.id = b.requester_id
    WHERE b.recipient_id = ? AND b.status = 'pending'
  `).all(userId);

  if (!buddy) return res.json({ buddy: null, pending_requests: pending });

  const buddyHabits = db.prepare(`
    SELECT h.id, h.name, h.color, h.frequency,
      (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND date(logged_at) = date('now')) as logged_today,
      (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id) as total_logs
    FROM habits h WHERE h.user_id = ? AND h.is_active = 1 ORDER BY h.created_at ASC
  `).all(buddy.buddy_user_id);

  const myHabits = db.prepare(`
    SELECT h.id, h.name, h.color, h.frequency,
      (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND date(logged_at) = date('now')) as logged_today,
      (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id) as total_logs
    FROM habits h WHERE h.user_id = ? AND h.is_active = 1 ORDER BY h.created_at ASC
  `).all(userId);

  res.json({
    buddy: {
      id: buddy.id,
      buddy_user_id: buddy.buddy_user_id,
      username: buddy.buddy_username,
      display_name: buddy.buddy_display_name,
      avatar_url: buddy.buddy_avatar_url,
      habits: buddyHabits,
    },
    my_habits: myHabits,
    pending_requests: pending,
  });
});

// GET /api/buddies/status/:userId — check buddy status with a specific user
router.get('/status/:userId', authMiddleware, (req, res) => {
  const db = getDb();
  const me = req.user.id;
  const other = req.params.userId;

  const row = db.prepare(
    'SELECT * FROM buddies WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)'
  ).get(me, other, other, me);

  if (!row) return res.json({ status: 'none' });
  if (row.status === 'active') return res.json({ status: 'active', id: row.id });
  if (row.status === 'pending') {
    return res.json({ status: 'pending', id: row.id, i_requested: row.requester_id === me });
  }
  res.json({ status: 'none' });
});

// POST /api/buddies/request
router.post('/request', authMiddleware, (req, res) => {
  const db = getDb();
  const { user_id } = req.body;

  if (!user_id || user_id === req.user.id) return res.status(400).json({ error: 'Invalid user' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (getActiveBuddy(db, req.user.id)) return res.status(400).json({ error: 'You already have a buddy' });
  if (getActiveBuddy(db, user_id)) return res.status(400).json({ error: 'This user already has a buddy' });

  const existing = db.prepare(
    'SELECT * FROM buddies WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)'
  ).get(req.user.id, user_id, user_id, req.user.id);

  if (existing?.status === 'pending') return res.status(400).json({ error: 'Request already sent' });

  const id = uuidv4();
  db.prepare("INSERT OR REPLACE INTO buddies (id, requester_id, recipient_id, status) VALUES (?, ?, ?, 'pending')")
    .run(id, req.user.id, user_id);

  db.prepare(
    "INSERT INTO notifications (id, user_id, type, from_user_id, message) VALUES (?, ?, 'buddy_request', ?, ?)"
  ).run(uuidv4(), user_id, req.user.id, 'wants to be your accountability buddy');

  const actor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
  sendPush(user_id, {
    title: 'Buddy request',
    body: `${actor?.display_name || 'Someone'} wants to be your accountability buddy.`,
    data: { type: 'buddy_request', userId: req.user.id },
  }, 'buddy');

  res.json({ requested: true, id });
});

// PUT /api/buddies/:id/accept
router.put('/:id/accept', authMiddleware, (req, res) => {
  const db = getDb();
  const buddy = db.prepare("SELECT * FROM buddies WHERE id = ? AND recipient_id = ? AND status = 'pending'")
    .get(req.params.id, req.user.id);
  if (!buddy) return res.status(404).json({ error: 'Request not found' });

  db.prepare("UPDATE buddies SET status = 'active' WHERE id = ?").run(req.params.id);

  db.prepare(
    "INSERT INTO notifications (id, user_id, type, from_user_id, message) VALUES (?, ?, 'buddy_accepted', ?, ?)"
  ).run(uuidv4(), buddy.requester_id, req.user.id, 'accepted your buddy request!');

  const actor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
  sendPush(buddy.requester_id, {
    title: 'Buddy accepted',
    body: `${actor?.display_name || 'Someone'} accepted your buddy request.`,
    data: { type: 'buddy_accepted', userId: req.user.id },
  }, 'buddy');

  res.json({ accepted: true });
});

// DELETE /api/buddies/:id — remove or decline
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const buddy = db.prepare('SELECT * FROM buddies WHERE id = ?').get(req.params.id);
  if (!buddy) return res.status(404).json({ error: 'Not found' });
  if (buddy.requester_id !== req.user.id && buddy.recipient_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  db.prepare('DELETE FROM buddies WHERE id = ?').run(req.params.id);
  res.json({ removed: true });
});

module.exports = router;
