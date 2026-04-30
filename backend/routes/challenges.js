const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { calculateStreak } = require('../utils/streaks');
const { sendPush } = require('../utils/push');

const router = express.Router();

// GET /api/challenges/search?q=
router.get('/search', optionalAuth, (req, res) => {
  const { q } = req.query;
  if (!q?.trim()) return res.json([]);
  if (q.trim().length > 100) return res.json([]);
  const db = getDb();
  const term = `%${q.trim()}%`;
  const userId = req.user?.id ?? null;
  const rows = db.prepare(
    `SELECT c.*, u.username, u.display_name,
       (SELECT COUNT(*) FROM challenge_members WHERE challenge_id = c.id AND status = 'active') as member_count
     FROM challenges c JOIN users u ON u.id = c.creator_id
     WHERE (c.name LIKE ? OR c.description LIKE ?)
       AND (c.visibility = 'public'
            OR c.creator_id = ?
            OR EXISTS (SELECT 1 FROM challenge_members WHERE challenge_id = c.id AND user_id = ? AND status = 'active'))
     ORDER BY member_count DESC LIMIT 20`
  ).all(term, term, userId, userId);

  const enriched = rows.map(c => {
    const memberRow = req.user
      ? db.prepare('SELECT status FROM challenge_members WHERE challenge_id = ? AND user_id = ?').get(c.id, req.user.id)
      : null;
    return { ...c, memberStatus: memberRow?.status ?? null };
  });

  res.json(enriched);
});

// GET /api/challenges/recommended
router.get('/recommended', optionalAuth, (req, res) => {
  const db = getDb();
  const userId = req.user?.id;

  // Base: public challenges not already joined, ordered by member count
  const joined = userId
    ? new Set(db.prepare("SELECT challenge_id FROM challenge_members WHERE user_id = ?").all(userId).map(r => r.challenge_id))
    : new Set();

  const followedIds = userId
    ? new Set(db.prepare('SELECT following_id FROM follows WHERE follower_id = ?').all(userId).map(f => f.following_id))
    : new Set();

  const challenges = db.prepare(
    `SELECT c.*, u.username, u.display_name,
       (SELECT COUNT(*) FROM challenge_members WHERE challenge_id = c.id AND status = 'active') as member_count
     FROM challenges c JOIN users u ON u.id = c.creator_id
     WHERE c.visibility = 'public'
     ORDER BY member_count DESC LIMIT 40`
  ).all();

  const scored = challenges
    .filter(c => !joined.has(c.id))
    .map(c => {
      let score = c.member_count;
      // Boost if a followed user is a member
      if (followedIds.size > 0) {
        const friendsIn = db.prepare(
          `SELECT COUNT(*) as c FROM challenge_members WHERE challenge_id = ? AND status = 'active' AND user_id IN (${[...followedIds].map(() => '?').join(',')})`
        ).get(c.id, ...[...followedIds]).c;
        score += friendsIn * 10;
      }
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  res.json(scored);
});

// GET /api/challenges/suggested  — personalized suggestions based on habits + joined clubs
router.get('/suggested', authMiddleware, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  // User's active habits
  const habits = db.prepare("SELECT name, frequency FROM habits WHERE user_id = ? AND is_active = 1").all(userId);
  const habitFreqs = new Set(habits.map(h => h.frequency));
  const habitKeywords = habits
    .flatMap(h => h.name.toLowerCase().split(/\s+/))
    .filter(w => w.length > 3);

  // User's currently joined clubs
  const myClubs = db.prepare(
    `SELECT c.id, c.frequency, c.name FROM challenges c
     JOIN challenge_members cm ON cm.challenge_id = c.id
     WHERE cm.user_id = ? AND cm.status = 'active'`
  ).all(userId);
  const myClubIds = new Set(myClubs.map(c => c.id));
  const myClubFreqs = new Set(myClubs.map(c => c.frequency));
  const myClubKeywords = myClubs
    .flatMap(c => c.name.toLowerCase().split(/\s+/))
    .filter(w => w.length > 3);

  // Pending clubs
  const pendingIds = new Set(
    db.prepare("SELECT challenge_id FROM challenge_members WHERE user_id = ? AND status = 'pending'").all(userId).map(r => r.challenge_id)
  );

  // Followed user IDs
  const followedIds = db.prepare('SELECT following_id FROM follows WHERE follower_id = ?').all(userId).map(f => f.following_id);

  // Candidate pool: public clubs not already in
  const candidates = db.prepare(
    `SELECT c.*, u.username, u.display_name,
       (SELECT COUNT(*) FROM challenge_members WHERE challenge_id = c.id AND status = 'active') as member_count
     FROM challenges c JOIN users u ON u.id = c.creator_id
     WHERE c.visibility = 'public'
     ORDER BY member_count DESC LIMIT 100`
  ).all().filter(c => !myClubIds.has(c.id) && !pendingIds.has(c.id));

  const scored = candidates.map(c => {
    let score = 0;
    const clubText = (c.name + ' ' + (c.description || '')).toLowerCase();
    const clubWords = clubText.split(/\s+/);

    // Habit frequency match — strongest signal
    if (habitFreqs.has(c.frequency)) score += 20;

    // Habit name keyword overlap
    for (const kw of habitKeywords) {
      if (clubWords.some(w => w.includes(kw) || kw.includes(w))) score += 12;
    }

    // Same frequency as a joined club
    if (myClubFreqs.has(c.frequency)) score += 5;

    // Keyword overlap with joined club names
    for (const kw of myClubKeywords) {
      if (clubWords.some(w => w.includes(kw) || kw.includes(w))) score += 8;
    }

    // Followed users are members here
    if (followedIds.length > 0) {
      const friendsIn = db.prepare(
        `SELECT COUNT(*) as c FROM challenge_members
         WHERE challenge_id = ? AND status = 'active'
         AND user_id IN (${followedIds.map(() => '?').join(',')})`
      ).get(c.id, ...followedIds).c;
      score += friendsIn * 10;
    }

    // Member count base score (ensures clubs always appear even with no signals)
    score += Math.min(c.member_count, 10);

    return { ...c, score };
  });

  const results = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  res.json(results);
});

// GET /api/challenges
router.get('/', optionalAuth, (req, res) => {
  const db = getDb();
  const userId = req.user?.id ?? null;
  const challenges = db.prepare(
    `SELECT c.*, u.username, u.display_name, u.avatar_url,
       (SELECT COUNT(*) FROM challenge_members WHERE challenge_id = c.id AND status = 'active') as member_count
     FROM challenges c
     JOIN users u ON u.id = c.creator_id
     WHERE c.visibility = 'public'
        OR c.creator_id = ?
        OR EXISTS (SELECT 1 FROM challenge_members WHERE challenge_id = c.id AND user_id = ? AND status = 'active')
     ORDER BY c.created_at DESC LIMIT 30`
  ).all(userId, userId);

  const enriched = challenges.map(ch => {
    let memberStatus = null; // null = not a member
    if (req.user) {
      const row = db.prepare('SELECT status FROM challenge_members WHERE challenge_id = ? AND user_id = ?').get(ch.id, req.user.id);
      if (row) memberStatus = row.status; // 'active' or 'pending'
    }
    return { ...ch, memberStatus };
  });

  res.json(enriched);
});

// POST /api/challenges
router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, description, frequency, start_date, end_date, visibility } = req.body;
  if (!name || !frequency || !start_date) {
    return res.status(400).json({ error: 'name, frequency, and start_date are required' });
  }
  if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
    return res.status(400).json({ error: 'Invalid frequency' });
  }
  if (name.trim().length > 100) return res.status(400).json({ error: 'Club name must be 100 characters or fewer' });
  if (description && description.length > 1000) return res.status(400).json({ error: 'Description must be 1000 characters or fewer' });
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(start_date) || isNaN(new Date(start_date).getTime())) {
    return res.status(400).json({ error: 'Invalid start_date format (YYYY-MM-DD required)' });
  }
  if (end_date && (!dateRe.test(end_date) || isNaN(new Date(end_date).getTime()))) {
    return res.status(400).json({ error: 'Invalid end_date format (YYYY-MM-DD required)' });
  }

  const id = uuidv4();
  const vis = visibility === 'private' ? 'private' : 'public';
  db.prepare(
    'INSERT INTO challenges (id, creator_id, name, description, frequency, visibility, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user.id, name, description || '', frequency, vis, start_date, end_date || null);

  // Auto-join creator as active
  db.prepare('INSERT INTO challenge_members (challenge_id, user_id, status) VALUES (?, ?, ?)').run(id, req.user.id, 'active');

  const challenge = db.prepare(
    `SELECT c.*, u.username, u.display_name, u.avatar_url, 1 as member_count
     FROM challenges c JOIN users u ON u.id = c.creator_id WHERE c.id = ?`
  ).get(id);

  res.status(201).json({ ...challenge, memberStatus: 'active' });
});

// GET /api/challenges/:id
router.get('/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const challenge = db.prepare(
    `SELECT c.*, u.username, u.display_name, u.avatar_url
     FROM challenges c JOIN users u ON u.id = c.creator_id WHERE c.id = ?`
  ).get(req.params.id);

  if (!challenge) return res.status(404).json({ error: 'Club not found' });

  const userId = req.user?.id;
  const memberRow = userId
    ? db.prepare('SELECT status FROM challenge_members WHERE challenge_id = ? AND user_id = ?').get(req.params.id, userId)
    : null;
  const memberStatus = memberRow?.status ?? null;
  const isCreator = userId === challenge.creator_id;
  const canSeeMembers = challenge.visibility === 'public' || memberStatus === 'active' || isCreator;

  let members = [];
  let pending_requests = [];

  if (canSeeMembers) {
    const rows = db.prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, cm.joined_at
       FROM challenge_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.challenge_id = ? AND cm.status = 'active'`
    ).all(req.params.id);

    members = rows.map(m => {
      const link = db.prepare('SELECT habit_id FROM challenge_habit_links WHERE challenge_id = ? AND user_id = ?').get(req.params.id, m.id);
      let streak = 0;
      if (link) {
        const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(link.habit_id);
        streak = calculateStreak(logs, challenge.frequency);
      }
      return { ...m, streak };
    });
  }

  if (isCreator && challenge.visibility === 'private') {
    pending_requests = db.prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, cm.joined_at as requested_at
       FROM challenge_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.challenge_id = ? AND cm.status = 'pending'`
    ).all(req.params.id);
  }

  const member_count = db.prepare("SELECT COUNT(*) as c FROM challenge_members WHERE challenge_id = ? AND status = 'active'").get(req.params.id).c;

  let my_linked_habit = null;
  if (userId && memberStatus === 'active') {
    my_linked_habit = db.prepare(
      `SELECT h.id, h.name, h.color FROM challenge_habit_links chl
       JOIN habits h ON h.id = chl.habit_id
       WHERE chl.challenge_id = ? AND chl.user_id = ?`
    ).get(req.params.id, userId) || null;
  }

  res.json({ ...challenge, members, pending_requests, memberStatus, member_count, my_linked_habit });
});

// POST /api/challenges/:id/join
router.post('/:id/join', authMiddleware, (req, res) => {
  const db = getDb();
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Club not found' });

  const existing = db.prepare('SELECT status FROM challenge_members WHERE challenge_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (existing) return res.json({ memberStatus: existing.status });

  const status = challenge.visibility === 'private' ? 'pending' : 'active';
  db.prepare('INSERT INTO challenge_members (challenge_id, user_id, status) VALUES (?, ?, ?)').run(req.params.id, req.user.id, status);

  if (status === 'active' && challenge.creator_id !== req.user.id) {
    db.prepare(
      "INSERT INTO notifications (id, user_id, type, from_user_id, challenge_id, message) VALUES (?, ?, 'challenge_join', ?, ?, ?)"
    ).run(uuidv4(), challenge.creator_id, req.user.id, req.params.id, `joined your club "${challenge.name}"`);
  } else if (status === 'pending') {
    db.prepare(
      "INSERT INTO notifications (id, user_id, type, from_user_id, challenge_id, message) VALUES (?, ?, 'challenge_join', ?, ?, ?)"
    ).run(uuidv4(), challenge.creator_id, req.user.id, req.params.id, `requested to join your club "${challenge.name}"`);
  }

  res.json({ memberStatus: status });
});

// POST /api/challenges/:id/members/:userId/approve  (creator only)
router.post('/:id/members/:userId/approve', authMiddleware, (req, res) => {
  const db = getDb();
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Club not found' });
  if (challenge.creator_id !== req.user.id) return res.status(403).json({ error: 'Not the creator' });

  db.prepare("UPDATE challenge_members SET status = 'active' WHERE challenge_id = ? AND user_id = ?").run(req.params.id, req.params.userId);

  db.prepare(
    "INSERT INTO notifications (id, user_id, type, from_user_id, challenge_id, message) VALUES (?, ?, 'challenge_join', ?, ?, ?)"
  ).run(uuidv4(), req.params.userId, req.user.id, req.params.id, `approved your request to join the club "${challenge.name}"`);

  res.json({ ok: true });
});

// DELETE /api/challenges/:id/members/:userId/reject  (creator only)
router.delete('/:id/members/:userId/reject', authMiddleware, (req, res) => {
  const db = getDb();
  const challenge = db.prepare('SELECT creator_id FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Club not found' });
  if (challenge.creator_id !== req.user.id) return res.status(403).json({ error: 'Not the creator' });

  db.prepare('DELETE FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = ?').run(req.params.id, req.params.userId, 'pending');
  res.json({ ok: true });
});

// DELETE /api/challenges/:id — creator only
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Club not found' });
  if (challenge.creator_id !== req.user.id) return res.status(403).json({ error: 'Only the creator can delete this club' });
  db.prepare('DELETE FROM challenge_members WHERE challenge_id = ?').run(req.params.id);
  db.prepare('DELETE FROM challenge_habit_links WHERE challenge_id = ?').run(req.params.id);
  db.prepare('DELETE FROM challenges WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// DELETE /api/challenges/:id/leave
router.delete('/:id/leave', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM challenge_members WHERE challenge_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  db.prepare('DELETE FROM challenge_habit_links WHERE challenge_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  const remaining = db.prepare("SELECT COUNT(*) as c FROM challenge_members WHERE challenge_id = ? AND status = 'active'").get(req.params.id).c;
  if (remaining === 0) {
    db.prepare('DELETE FROM challenge_habit_links WHERE challenge_id = ?').run(req.params.id);
    db.prepare('DELETE FROM challenges WHERE id = ?').run(req.params.id);
  }
  res.json({ memberStatus: null });
});

// POST /api/challenges/:id/link-habit
router.post('/:id/link-habit', authMiddleware, (req, res) => {
  const db = getDb();
  const { habit_id } = req.body;
  const member = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'").get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not an active member of this club' });

  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(habit_id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  db.prepare('INSERT OR REPLACE INTO challenge_habit_links (challenge_id, user_id, habit_id) VALUES (?, ?, ?)').run(req.params.id, req.user.id, habit_id);
  res.json({ linked: true });
});

// POST /api/challenges/:id/invite
router.post('/:id/invite', authMiddleware, (req, res) => {
  const db = getDb();
  const { user_id } = req.body;
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Club not found' });

  const membership = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'").get(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'You must be a member to invite others' });

  const invitee = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!invitee) return res.status(404).json({ error: 'User not found' });

  // Don't invite someone who is already a member
  const alreadyMember = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ?").get(req.params.id, user_id);
  if (alreadyMember) return res.status(409).json({ error: 'User is already a member of this club' });

  // Prevent duplicate pending invites
  const recentInvite = db.prepare(
    "SELECT 1 FROM notifications WHERE user_id = ? AND type = 'challenge_invite' AND challenge_id = ? AND from_user_id = ? AND created_at >= datetime('now', '-24 hours')"
  ).get(user_id, req.params.id, req.user.id);
  if (recentInvite) return res.status(429).json({ error: 'Already invited this user recently' });

  db.prepare(
    "INSERT INTO notifications (id, user_id, type, from_user_id, challenge_id, message) VALUES (?, ?, 'challenge_invite', ?, ?, ?)"
  ).run(uuidv4(), user_id, req.user.id, req.params.id, `invited you to join the club "${challenge.name}"`);

  const actor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
  sendPush(user_id, {
    title: 'Club invite',
    body: `${actor?.display_name || 'Someone'} invited you to join "${challenge.name}"`,
    data: { type: 'challenge_invite', challengeId: req.params.id },
  }, 'challenges');

  res.json({ invited: true });
});

// GET /api/challenges/:id/chat/mute
router.get('/:id/chat/mute', authMiddleware, (req, res) => {
  const db = getDb();
  const member = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'").get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not an active member' });

  const row = db.prepare('SELECT muted_until FROM chat_mutes WHERE user_id = ? AND context_type = ? AND context_id = ?').get(req.user.id, 'club', req.params.id);
  const is_muted = row ? (row.muted_until === null || new Date(row.muted_until) > new Date()) : false;
  if (row && row.muted_until !== null && new Date(row.muted_until) <= new Date()) {
    db.prepare('DELETE FROM chat_mutes WHERE user_id = ? AND context_type = ? AND context_id = ?').run(req.user.id, 'club', req.params.id);
  }
  res.json({ is_muted, muted_until: row?.muted_until ?? null });
});

// POST /api/challenges/:id/chat/mute
router.post('/:id/chat/mute', authMiddleware, (req, res) => {
  const db = getDb();
  const member = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'").get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not an active member' });

  const { duration } = req.body;
  const durations = { '1h': 3600000, '3h': 10800000, '5h': 18000000, '1d': 86400000 };
  const muted_until = duration === 'forever' ? null : new Date(Date.now() + (durations[duration] || 3600000)).toISOString();

  db.prepare('INSERT OR REPLACE INTO chat_mutes (user_id, context_type, context_id, muted_until) VALUES (?, ?, ?, ?)').run(req.user.id, 'club', req.params.id, muted_until);
  res.json({ is_muted: true, muted_until });
});

// DELETE /api/challenges/:id/chat/mute
router.delete('/:id/chat/mute', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM chat_mutes WHERE user_id = ? AND context_type = ? AND context_id = ?').run(req.user.id, 'club', req.params.id);
  res.json({ is_muted: false, muted_until: null });
});

// GET /api/challenges/:id/messages  (active members only)
router.get('/:id/messages', authMiddleware, (req, res) => {
  const db = getDb();
  const member = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'").get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not an active member' });

  const messages = db.prepare(
    `SELECT m.id, m.content, m.created_at, u.id as user_id, u.username, u.display_name, u.avatar_url
     FROM challenge_messages m JOIN users u ON u.id = m.user_id
     WHERE m.challenge_id = ?
     ORDER BY m.created_at ASC LIMIT 200`
  ).all(req.params.id);

  res.json(messages);
});

// POST /api/challenges/:id/messages  (active members only)
router.post('/:id/messages', authMiddleware, (req, res) => {
  const db = getDb();
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  if (content.length > 2000) return res.status(400).json({ error: 'Message must be 2000 characters or fewer' });

  const member = db.prepare("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'").get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not an active member' });

  const id = uuidv4();
  db.prepare('INSERT INTO challenge_messages (id, challenge_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, req.params.id, req.user.id, content.trim());

  const message = db.prepare(
    `SELECT m.id, m.content, m.created_at, u.id as user_id, u.username, u.display_name, u.avatar_url
     FROM challenge_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`
  ).get(id);

  // Push to all other active members who haven't muted this club
  const challenge = db.prepare('SELECT name FROM challenges WHERE id = ?').get(req.params.id);
  const otherMembers = db.prepare(`
    SELECT cm.user_id FROM challenge_members cm
    WHERE cm.challenge_id = ? AND cm.status = 'active' AND cm.user_id != ?
      AND NOT EXISTS (
        SELECT 1 FROM chat_mutes mu
        WHERE mu.user_id = cm.user_id AND mu.context_type = 'club'
          AND mu.context_id = ? AND (mu.muted_until IS NULL OR mu.muted_until > datetime('now'))
      )
  `).all(req.params.id, req.user.id, req.params.id);

  const preview = message.content.length > 60 ? message.content.slice(0, 60) + '…' : message.content;
  for (const m of otherMembers) {
    sendPush(m.user_id, {
      title: challenge?.name || 'Club',
      body: `${message.display_name}: ${preview}`,
      data: { type: 'challenge_message', challengeId: req.params.id },
    }, 'challenges');
  }

  res.status(201).json(message);
});

module.exports = router;
