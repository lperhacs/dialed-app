const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Privacy filter — applied to every list/search/discover query so private
// events (is_public = 0) only surface for the creator OR active club members.
// TWO positional ? params required, both req.user.id, in order:
//   1. creator self-check
//   2. challenge_members.user_id check
const EVENT_PRIVACY_FILTER = `(
  e.is_public = 1
  OR e.creator_id = ?
  OR (e.club_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM challenge_members cm
    WHERE cm.challenge_id = e.club_id AND cm.user_id = ? AND cm.status = 'active'
  ))
)`;

// EVENT_SELECT uses 3 positional ? params, all for userId (in order):
//   1. my_status subquery
//   2. friends_going_names follower_id
//   3. friends_going_count follower_id
const EVENT_SELECT = `
  SELECT e.*,
    u.username, u.display_name, u.avatar_url,
    c.name as club_name,
    (SELECT COUNT(*) FROM event_attendees WHERE event_id = e.id AND status = 'going') as going_count,
    (SELECT status FROM event_attendees WHERE event_id = e.id AND user_id = ?) as my_status,
    (SELECT GROUP_CONCAT(u2.display_name, '||')
     FROM event_attendees ea2
     JOIN users u2 ON u2.id = ea2.user_id
     JOIN follows f ON f.following_id = ea2.user_id AND f.follower_id = ?
     WHERE ea2.event_id = e.id AND ea2.status = 'going' AND u2.rsvp_private = 0
     LIMIT 3) as friends_going_names,
    (SELECT COUNT(*)
     FROM event_attendees ea2
     JOIN users u2 ON u2.id = ea2.user_id
     JOIN follows f ON f.following_id = ea2.user_id AND f.follower_id = ?
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
  // Escape LIKE wildcards (%, _, \) so user input can't trigger expensive full scans
  const term = `%${q.trim().replace(/[%_\\]/g, '\\$&')}%`;
  const rows = db.prepare(`
    ${EVENT_SELECT}
    WHERE (e.title LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR e.location LIKE ? ESCAPE '\\')
      AND ${EVENT_PRIVACY_FILTER}
    ORDER BY e.event_date ASC LIMIT 20
  `).all(req.user.id, req.user.id, req.user.id, term, term, term, req.user.id, req.user.id);
  res.json(rows);
});

// GET /api/events — list all upcoming events (privacy-filtered)
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`${EVENT_SELECT} WHERE e.event_date >= date('now') AND ${EVENT_PRIVACY_FILTER} ORDER BY e.event_date ASC`)
    .all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
  res.json(rows);
});

// GET /api/events/discover — personalized events based on habits + followed RSVPs
router.get('/discover', authMiddleware, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  // Get all upcoming events with base fields (privacy-filtered)
  const events = db.prepare(`${EVENT_SELECT} WHERE e.event_date >= date('now') AND ${EVENT_PRIVACY_FILTER} ORDER BY e.event_date ASC`)
    .all(userId, userId, userId, userId, userId);

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
    JOIN event_attendees ea ON ea.event_id = e.id AND ea.user_id = ? AND ea.status = 'going'
    WHERE e.event_date >= date('now')
    ORDER BY e.event_date ASC`)
    .all(req.user.id, req.user.id, req.user.id, req.user.id);
  res.json(rows);
});

// GET /api/events/club/:clubId — events for a specific club (must be a member or public-only)
router.get('/club/:clubId', authMiddleware, (req, res) => {
  const db = getDb();
  // Confirm the requester is an active member before exposing private club events.
  const isMember = db.prepare(
    "SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'"
  ).get(req.params.clubId, req.user.id);
  const sql = isMember
    ? `${EVENT_SELECT} WHERE e.club_id = ? AND e.event_date >= date('now') ORDER BY e.event_date ASC`
    : `${EVENT_SELECT} WHERE e.club_id = ? AND e.event_date >= date('now') AND e.is_public = 1 ORDER BY e.event_date ASC`;
  const rows = db.prepare(sql).all(req.user.id, req.user.id, req.user.id, req.params.clubId);
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
  if (event_time && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(event_time)) {
    return res.status(400).json({ error: 'Invalid event_time format (HH:MM or HH:MM:SS required)' });
  }

  const db = getDb();

  // Verify club exists and user is a member
  if (club_id) {
    const club = db.prepare('SELECT id FROM challenges WHERE id = ?').get(club_id);
    if (!club) return res.status(404).json({ error: 'Club not found' });
    const membership = db.prepare(
      "SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'"
    ).get(club_id, req.user.id);
    if (!membership) return res.status(403).json({ error: 'You must be a member of that club' });
  }

  // Idempotency: block duplicate submissions within 10 seconds
  const recent = db.prepare(
    `SELECT id FROM events WHERE creator_id = ? AND title = ? AND event_date = ? AND created_at >= datetime('now', '-10 seconds')`
  ).get(req.user.id, title.trim(), event_date);
  if (recent) return res.status(201).json(db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(req.user.id, req.user.id, req.user.id, recent.id));

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
    const creatorName = (creator && creator.display_name) || 'Someone';
    const clubName = (club && club.name) || 'your club';
    const message = `${creatorName} posted an event in ${clubName}: "${title.trim()}" on ${new Date(event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    const insert = db.prepare(
      "INSERT INTO notifications (id, user_id, from_user_id, type, message, reference_id) VALUES (?, ?, ?, 'club_event', ?, ?)"
    );
    for (const { user_id } of members) {
      insert.run(uuidv4(), user_id, req.user.id, message, id);
    }
  }

  const event = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(req.user.id, req.user.id, req.user.id, id);
  res.status(201).json(event);
});

// POST /api/events/:id/rsvp — toggle RSVP
router.post('/:id/rsvp', authMiddleware, (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Authorization: private events require creator OR active club membership
  if (!event.is_public) {
    if (event.club_id) {
      const isMember = db.prepare(
        "SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'"
      ).get(event.club_id, req.user.id);
      if (!isMember && event.creator_id !== req.user.id) {
        return res.status(403).json({ error: 'Members only' });
      }
    } else if (event.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

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
