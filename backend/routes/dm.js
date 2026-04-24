const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { sendPush } = require('../utils/push');

const router = express.Router();

function otherParticipant(db, conversationId, myId) {
  return db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM conversation_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = ? AND cp.user_id != ?`
  ).get(conversationId, myId);
}

function lastMessage(db, conversationId) {
  return db.prepare(
    `SELECT dm.*, u.username, u.display_name
     FROM direct_messages dm
     JOIN users u ON u.id = dm.sender_id
     WHERE dm.conversation_id = ?
     ORDER BY dm.created_at DESC LIMIT 1`
  ).get(conversationId);
}

// GET /api/dm/inbox
router.get('/inbox', authMiddleware, (req, res) => {
  const db = getDb();

  const convIds = db.prepare(
    'SELECT conversation_id FROM conversation_participants WHERE user_id = ? ORDER BY conversation_id'
  ).all(req.user.id).map(r => r.conversation_id);

  const conversations = convIds.map(id => {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    const last = lastMessage(db, id);

    if (conv?.is_group) {
      const participants = db.prepare(
        `SELECT u.id, u.username, u.display_name, u.avatar_url
         FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.conversation_id = ? AND cp.user_id != ?
         LIMIT 3`
      ).all(id, req.user.id);
      const participant_count = db.prepare('SELECT COUNT(*) as c FROM conversation_participants WHERE conversation_id = ?').get(id).c;
      return { id, name: conv.name, is_group: true, participants, participant_count, last_message: last || null };
    }

    const other = otherParticipant(db, id, req.user.id);
    return { id, other, is_group: false, last_message: last || null };
  });

  conversations.sort((a, b) => {
    const ta = a.last_message?.created_at || '';
    const tb = b.last_message?.created_at || '';
    return tb.localeCompare(ta);
  });

  res.json(conversations);
});

// POST /api/dm/group — create a group conversation (up to 250 members)
router.post('/group', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, user_ids } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Group name is required' });
  if (!Array.isArray(user_ids) || user_ids.length === 0) return res.status(400).json({ error: 'At least one other member is required' });

  const allIds = [...new Set([...user_ids, req.user.id])];
  if (allIds.length > 251) return res.status(400).json({ error: 'Group chats are limited to 250 members' });

  // Validate all user IDs exist
  for (const uid of user_ids) {
    if (typeof uid !== 'string') return res.status(400).json({ error: 'Invalid user_ids' });
    const exists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid);
    if (!exists) return res.status(404).json({ error: `User not found: ${uid}` });
  }

  const id = uuidv4();
  db.prepare('INSERT INTO conversations (id, name, is_group) VALUES (?, ?, 1)').run(id, name.trim());
  for (const uid of allIds) {
    db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)').run(id, uid);
  }

  const participants = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM conversation_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = ? AND cp.user_id != ?
     LIMIT 3`
  ).all(id, req.user.id);

  res.status(201).json({ id, name: name.trim(), is_group: true, participants, participant_count: allIds.length, last_message: null });
});

// POST /api/dm/conversations — get or create a 1-on-1 conversation
router.post('/conversations', authMiddleware, (req, res) => {
  const db = getDb();
  const { user_id } = req.body;
  if (!user_id || user_id === req.user.id) {
    return res.status(400).json({ error: 'Invalid user' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Look for an existing conversation between the two users
  const existing = db.prepare(
    `SELECT cp1.conversation_id
     FROM conversation_participants cp1
     JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
     WHERE cp1.user_id = ? AND cp2.user_id = ?
     LIMIT 1`
  ).get(req.user.id, user_id);

  if (existing) {
    const other = otherParticipant(db, existing.conversation_id, req.user.id);
    return res.json({ id: existing.conversation_id, other });
  }

  // Create new
  const id = uuidv4();
  db.prepare('INSERT INTO conversations (id) VALUES (?)').run(id);
  db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)').run(id, req.user.id);
  db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)').run(id, user_id);

  const other = otherParticipant(db, id, req.user.id);
  res.status(201).json({ id, other });
});

// GET /api/dm/conversations/:id/messages
router.get('/conversations/:id/messages', authMiddleware, (req, res) => {
  const db = getDb();

  const member = db.prepare(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a participant' });

  const messages = db.prepare(
    `SELECT dm.id, dm.content, dm.created_at, dm.post_id, dm.event_id, dm.club_id,
       u.id as sender_id, u.username, u.display_name, u.avatar_url
     FROM direct_messages dm
     JOIN users u ON u.id = dm.sender_id
     WHERE dm.conversation_id = ?
     ORDER BY dm.created_at ASC LIMIT 200`
  ).all(req.params.id);

  const enriched = messages.map(m => {
    const result = { ...m };
    if (m.post_id) {
      result.shared_post = db.prepare(
        `SELECT p.id, p.content, p.habit_day, h.name as habit_name, h.color as habit_color,
           u.username, u.display_name, u.avatar_url
         FROM posts p JOIN users u ON u.id = p.user_id
         LEFT JOIN habits h ON h.id = p.habit_id WHERE p.id = ?`
      ).get(m.post_id) || null;
    }
    if (m.event_id) {
      result.shared_event = db.prepare(
        `SELECT e.id, e.title, e.event_date, e.event_time, e.location, u.username, u.display_name
         FROM events e JOIN users u ON u.id = e.creator_id WHERE e.id = ?`
      ).get(m.event_id) || null;
    }
    if (m.club_id) {
      result.shared_club = db.prepare(
        `SELECT c.id, c.name, c.description, c.frequency,
           (SELECT COUNT(*) FROM challenge_members WHERE challenge_id = c.id AND status = 'active') as member_count,
           u.username
         FROM challenges c JOIN users u ON u.id = c.creator_id WHERE c.id = ?`
      ).get(m.club_id) || null;
    }
    return result;
  });

  res.json(enriched);
});

// GET /api/dm/conversations/:id/mute
router.get('/conversations/:id/mute', authMiddleware, (req, res) => {
  const db = getDb();
  const member = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a participant' });

  const row = db.prepare('SELECT muted_until FROM chat_mutes WHERE user_id = ? AND context_type = ? AND context_id = ?').get(req.user.id, 'dm', req.params.id);
  const is_muted = row ? (row.muted_until === null || new Date(row.muted_until) > new Date()) : false;
  if (row && row.muted_until !== null && new Date(row.muted_until) <= new Date()) {
    db.prepare('DELETE FROM chat_mutes WHERE user_id = ? AND context_type = ? AND context_id = ?').run(req.user.id, 'dm', req.params.id);
  }
  res.json({ is_muted, muted_until: row?.muted_until ?? null });
});

// POST /api/dm/conversations/:id/mute
router.post('/conversations/:id/mute', authMiddleware, (req, res) => {
  const db = getDb();
  const member = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a participant' });

  const { duration } = req.body;
  const durations = { '1h': 3600000, '3h': 10800000, '5h': 18000000, '1d': 86400000 };
  const muted_until = duration === 'forever' ? null : new Date(Date.now() + (durations[duration] || 3600000)).toISOString();

  db.prepare('INSERT OR REPLACE INTO chat_mutes (user_id, context_type, context_id, muted_until) VALUES (?, ?, ?, ?)').run(req.user.id, 'dm', req.params.id, muted_until);
  res.json({ is_muted: true, muted_until });
});

// DELETE /api/dm/conversations/:id/mute
router.delete('/conversations/:id/mute', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM chat_mutes WHERE user_id = ? AND context_type = ? AND context_id = ?').run(req.user.id, 'dm', req.params.id);
  res.json({ is_muted: false, muted_until: null });
});

// POST /api/dm/conversations/:id/messages
router.post('/conversations/:id/messages', authMiddleware, (req, res) => {
  const db = getDb();
  const { content, post_id, event_id, club_id } = req.body;
  if (!content?.trim() && !post_id && !event_id && !club_id) return res.status(400).json({ error: 'Message cannot be empty' });
  if (content && content.length > 2000) return res.status(400).json({ error: 'Message must be 2000 characters or fewer' });

  const member = db.prepare(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a participant' });

  // Validate shared content exists before inserting
  if (post_id) {
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(post_id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
  }
  if (event_id) {
    const event = db.prepare('SELECT id FROM events WHERE id = ?').get(event_id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
  }
  if (club_id) {
    const club = db.prepare("SELECT id, visibility FROM challenges WHERE id = ?").get(club_id);
    if (!club) return res.status(404).json({ error: 'Club not found' });
    if (club.visibility === 'private') {
      const clubMember = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'").get(club_id, req.user.id);
      if (!clubMember) return res.status(403).json({ error: 'Cannot share a private club you are not a member of' });
    }
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO direct_messages (id, conversation_id, sender_id, content, post_id, event_id, club_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.params.id, req.user.id, content?.trim() || '', post_id || null, event_id || null, club_id || null);

  const message = db.prepare(
    `SELECT dm.id, dm.content, dm.created_at, dm.post_id, dm.event_id, dm.club_id,
       u.id as sender_id, u.username, u.display_name, u.avatar_url
     FROM direct_messages dm
     JOIN users u ON u.id = dm.sender_id
     WHERE dm.id = ?`
  ).get(id);

  const result = { ...message };

  // Push to all other participants
  const sender = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
  const recipients = db.prepare(
    'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?'
  ).all(req.params.id, req.user.id);
  const preview = content?.trim()
    ? (content.trim().length > 60 ? content.trim().slice(0, 60) + '…' : content.trim())
    : post_id ? 'Shared a post' : event_id ? 'Shared an event' : 'Shared a club';
  for (const r of recipients) {
    sendPush(r.user_id, {
      title: sender?.display_name || 'New message',
      body: preview,
      data: { type: 'message', conversationId: req.params.id },
    }, 'messages');
  }

  if (post_id) {
    result.shared_post = db.prepare(
      `SELECT p.id, p.content, p.habit_day, h.name as habit_name, h.color as habit_color,
         u.username, u.display_name, u.avatar_url
       FROM posts p JOIN users u ON u.id = p.user_id
       LEFT JOIN habits h ON h.id = p.habit_id WHERE p.id = ?`
    ).get(post_id) || null;
  }

  if (event_id) {
    result.shared_event = db.prepare(
      `SELECT e.id, e.title, e.event_date, e.event_time, e.location, u.username, u.display_name
       FROM events e JOIN users u ON u.id = e.creator_id WHERE e.id = ?`
    ).get(event_id) || null;
  }

  if (club_id) {
    result.shared_club = db.prepare(
      `SELECT c.id, c.name, c.description, c.frequency,
         (SELECT COUNT(*) FROM challenge_members WHERE challenge_id = c.id AND status = 'active') as member_count,
         u.username
       FROM challenges c JOIN users u ON u.id = c.creator_id WHERE c.id = ?`
    ).get(club_id) || null;
  }

  res.status(201).json(result);
});

module.exports = router;
