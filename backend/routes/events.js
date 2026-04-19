const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const EVENT_SELECT = `
  SELECT e.*,
    u.username, u.display_name, u.avatar_url,
    c.name as club_name,
    (SELECT COUNT(*) FROM event_attendees WHERE event_id = e.id AND status = 'going') as going_count,
    (SELECT status FROM event_attendees WHERE event_id = e.id AND user_id = :userId) as my_status,
    (SELECT GROUP_CONCAT(u2.display_name, '||')
     FROM event_attendees ea2
     JOIN users u2 ON u2.id = ea2.user_id
     JOIN follows f ON f.following_id = ea2.user_id AND f.follower_id = :userId
     WHERE ea2.event_id = e.id AND ea2.status = 'going' AND u2.rsvp_private = 0
     LIMIT 3) as friends_going_names,
    (SELECT COUNT(*)
     FROM event_attendees ea2
     JOIN users u2 ON u2.id = ea2.user_id
     JOIN follows f ON f.following_id = ea2.user_id AND f.follower_id = :userId
     WHERE ea2.event_id = e.id AND ea2.status = 'going' AND u2.rsvp_private = 0) as friends_going_count
  FROM events e
  JOIN users u ON u.id = e.creator_id
  LEFT JOIN challenges c ON c.id = e.club_id
`;

// GET /api/events/search?q=
router.get('/search', authMiddleware, (req, res) => {
  const { q } = req.query;
  if (!q?.trim()) return res.json([]);
  const db = getDb();
  const term = `%${q.trim()}%`;
  const rows = db.prepare(`
    ${EVENT_SELECT}
    WHERE (e.title LIKE :term OR e.description LIKE :term OR e.location LIKE :term)
    ORDER BY e.event_date ASC LIMIT 20
  `).all({ userId: req.user.id, term });
  res.json(rows);
});

// GET /api/events — list all upcoming events
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`${EVENT_SELECT} WHERE e.event_date >= date('now') ORDER BY e.event_date ASC`)
    .all({ userId: req.user.id });
  res.json(rows);
});

// GET /api/events/discover — personalized events based on habits + followed RSVPs
router.get('/discover', authMiddleware, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  // Get all upcoming events with base fields
  const events = db.prepare(`${EVENT_SELECT} WHERE e.event_date >= date('now') ORDER BY e.event_date ASC`)
    .all({ userId });

  // Habit keywords for this user
  const habits = db.prepare("SELECT name FROM habits WHERE user_id = ? AND is_active = 1").all(userId);
  const keywords = habits.map(h => h.name.toLowerCase());

  // Score each event
  const scored = events.map(ev => {
    let score = 0;
    // Friends going (already filtered by rsvp_private in EVENT_SELECT)
    score += (ev.friends_going_count || 0) * 10;
    // Keyword match in title or description
    const haystack = `${ev.title} ${ev.description || ''}`.toLowerCase();
    for (const kw of keywords) {
      if (haystack.includes(kw)) score += 5;
    }
    return { ...ev, _score: score };
  });

  // Sort: scored events first (desc), then chronologically
  scored.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return new Date(a.event_date) - new Date(b.event_date);
  });

  res.json(scored.map(({ _score, ...ev }) => ev));
});

// GET /api/events/mine — events the current user has RSVP'd to
router.get('/mine', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`${EVENT_SELECT}
    JOIN event_attendees ea ON ea.event_id = e.id AND ea.user_id = :userId AND ea.status = 'going'
    ORDER BY e.event_date ASC`)
    .all({ userId: req.user.id });
  res.json(rows);
});

// GET /api/events/club/:clubId — events for a specific club
router.get('/club/:clubId', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`${EVENT_SELECT} WHERE e.club_id = :clubId AND e.event_date >= date('now') ORDER BY e.event_date ASC`)
    .all({ userId: req.user.id, clubId: req.params.clubId });
  res.json(rows);
});

// POST /api/events — create an event
router.post('/', authMiddleware, (req, res) => {
  const { title, description, event_date, event_time, location, is_public, club_id } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!event_date) return res.status(400).json({ error: 'Event date is required' });
  if (title.trim().length > 200) return res.status(400).json({ error: 'Title must be 200 characters or fewer' });
  if (description && description.length > 2000) return res.status(400).json({ error: 'Description must be 2000 characters or fewer' });
  if (location && location.trim().length > 200) return res.status(400).json({ error: 'Location must be 200 characters or fewer' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date) || isNaN(new Date(event_date).getTime())) {
    return res.status(400).json({ error: 'Invalid event date format (YYYY-MM-DD required)' });
  }

  const db = getDb();

  // Verify user is a member of the club if club_id provided
  if (club_id) {
    const membership = db.prepare(
      "SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'"
    ).get(club_id, req.user.id);
    if (!membership) return res.status(403).json({ error: 'You must be a member of that club' });
  }

  // Idempotency: block duplicate submissions within 10 seconds
  const recent = db.prepare(
    `SELECT id FROM events WHERE creator_id = ? AND title = ? AND event_date = ? AND created_at >= datetime('now', '-10 seconds')`
  ).get(req.user.id, title.trim(), event_date);
  if (recent) return res.status(201).json(db.prepare(`${EVENT_SELECT} WHERE e.id = :id`).get({ userId: req.user.id, id: recent.id }));

  const id = uuidv4();
  db.prepare(`
    INSERT INTO events (id, creator_id, title, description, event_date, event_time, location, is_public, club_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, title.trim(), description?.trim() || null, event_date, event_time || null, location?.trim() || null, is_public ? 1 : 0, club_id || null);

  // Fan-out notifications to club members
  if (club_id) {
    const club = db.prepare('SELECT name FROM challenges WHERE id = ?').get(club_id);
    const members = db.prepare(
      "SELECT user_id FROM challenge_members WHERE challenge_id = ? AND user_id != ? AND status = 'active'"
    ).all(club_id, req.user.id);

    const creator = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
    const message = `${creator.display_name} posted an event in ${club.name}: "${title.trim()}" on ${new Date(event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    const insert = db.prepare(
      "INSERT INTO notifications (id, user_id, from_user_id, type, message, reference_id) VALUES (?, ?, ?, 'club_event', ?, ?)"
    );
    for (const { user_id } of members) {
      insert.run(uuidv4(), user_id, req.user.id, message, id);
    }
  }

  const event = db.prepare(`${EVENT_SELECT} WHERE e.id = :id`).get({ userId: req.user.id, id });
  res.status(201).json(event);
});

// POST /api/events/:id/rsvp — toggle RSVP
router.post('/:id/rsvp', authMiddleware, (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const existing = db.prepare('SELECT * FROM event_attendees WHERE event_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (existing) {
    db.prepare('DELETE FROM event_attendees WHERE event_id = ? AND user_id = ?').run(req.params.id, req.user.id);
    return res.json({ status: null });
  } else {
    db.prepare('INSERT OR REPLACE INTO event_attendees (event_id, user_id, status) VALUES (?, ?, ?)').run(req.params.id, req.user.id, 'going');
    return res.json({ status: 'going' });
  }
});

// DELETE /api/events/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  db.prepare('DELETE FROM event_attendees WHERE event_id = ?').run(req.params.id);
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
