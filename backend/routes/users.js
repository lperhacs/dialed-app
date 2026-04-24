const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { calculateStreak, isStreakAtRisk, getEarnedBadges, BADGE_DEFS } = require('../utils/streaks');
const { sendPush } = require('../utils/push');

const router = express.Router();

function enrichUser(db, user, viewerId) {
  const followerCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(user.id).c;
  const followingCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(user.id).c;
  const postCount = db.prepare('SELECT COUNT(*) as c FROM posts WHERE user_id = ?').get(user.id).c;

  let is_following = false;
  if (viewerId && viewerId !== user.id) {
    is_following = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(viewerId, user.id);
  }

  const badges = db.prepare('SELECT * FROM badges WHERE user_id = ? AND pinned = 1 ORDER BY awarded_at DESC LIMIT 1').all(user.id);

  let featured_streak = null;
  if (user.featured_habit_id) {
    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ? AND is_active = 1').get(user.featured_habit_id, user.id);
    if (habit) {
      const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(habit.id);
      const streak = calculateStreak(logs, habit.frequency);
      featured_streak = { habit_id: habit.id, habit_name: habit.name, streak };
    }
  }

  return { ...user, follower_count: followerCount, following_count: followingCount, post_count: postCount, is_following, badges, featured_streak };
}

// GET /api/users/recommended  — people to follow during onboarding
router.get('/recommended', authMiddleware, (req, res) => {
  const db = getDb();
  // People not already followed, ordered by follower count descending
  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url,
           (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS follower_count
    FROM users u
    WHERE u.id != ?
      AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
    ORDER BY follower_count DESC
    LIMIT 10
  `).all(req.user.id, req.user.id);

  // Attach featured habit name + streak for display
  const enriched = users.map(u => {
    const habit = db.prepare(`
      SELECT h.name, h.frequency FROM habits h
      INNER JOIN users us ON us.featured_habit_id = h.id
      WHERE us.id = ? AND h.user_id = ? AND h.is_active = 1
    `).get(u.id, u.id);
    return { ...u, habit_name: habit?.name ?? null, streak: null };
  });

  res.json(enriched);
});

// GET /api/users/suggested — recent DM contacts + most engaged users (for @mention default list)
router.get('/suggested', authMiddleware, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const seen = new Set([userId]);
  const results = [];

  const addUser = (row) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    results.push({ id: row.id, username: row.username, display_name: row.display_name, avatar_url: row.avatar_url });
  };

  // 1. Recent DM conversation partners
  db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM conversation_participants cp
     JOIN conversations c ON c.id = cp.conversation_id
     JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id != ?
     JOIN users u ON u.id = cp2.user_id
     WHERE cp.user_id = ? AND c.is_group = 0
     ORDER BY (SELECT MAX(created_at) FROM direct_messages WHERE conversation_id = c.id) DESC
     LIMIT 5`
  ).all(userId, userId).forEach(addUser);

  // 2. People who recently commented on the user's posts
  db.prepare(
    `SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url
     FROM comments c
     JOIN posts p ON p.id = c.post_id
     JOIN users u ON u.id = c.user_id
     WHERE p.user_id = ? AND c.user_id != ?
     ORDER BY c.created_at DESC LIMIT 5`
  ).all(userId, userId).forEach(addUser);

  // 3. People whose posts the user recently liked
  db.prepare(
    `SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url
     FROM likes l
     JOIN posts p ON p.id = l.post_id
     JOIN users u ON u.id = p.user_id
     WHERE l.user_id = ? AND p.user_id != ?
     ORDER BY l.created_at DESC LIMIT 5`
  ).all(userId, userId).forEach(addUser);

  // 4. People the user follows (fallback)
  if (results.length < 8) {
    db.prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM follows f JOIN users u ON u.id = f.following_id
       WHERE f.follower_id = ? LIMIT 8`
    ).all(userId).forEach(addUser);
  }

  res.json(results.slice(0, 8));
});

// GET /api/users/search
router.get('/search', optionalAuth, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  if (q.length > 50) return res.json([]);
  const db = getDb();
  const users = db.prepare(
    "SELECT id, username, display_name, avatar_url FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 10"
  ).all(`%${q}%`, `%${q}%`);
  res.json(users);
});

// GET /api/users/:username
router.get('/:username', optionalAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, display_name, bio, avatar_url, featured_habit_id, created_at FROM users WHERE username = ?'
  ).get(req.params.username);

  if (!user) return res.status(404).json({ error: 'User not found' });

  const viewerId = req.user?.id;
  res.json(enrichUser(db, user, viewerId));
});

// PUT /api/users/profile
router.put('/profile', authMiddleware, upload.single('avatar'), (req, res) => {
  const db = getDb();
  const { display_name, bio, featured_habit_id, username } = req.body;
  const avatar_url = req.file ? `/uploads/${req.file.filename}` : undefined;

  if (display_name !== undefined && display_name.trim().length > 50) {
    return res.status(400).json({ error: 'Display name must be 50 characters or fewer' });
  }
  if (bio !== undefined && bio.trim().length > 300) {
    return res.status(400).json({ error: 'Bio must be 300 characters or fewer' });
  }

  const updates = [];
  const values = [];
  if (display_name?.trim()) { updates.push('display_name = ?'); values.push(display_name.trim()); }
  if (bio !== undefined) { updates.push('bio = ?'); values.push(bio); }
  if (avatar_url) { updates.push('avatar_url = ?'); values.push(avatar_url); }
  if (username?.trim()) {
    const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim().toLowerCase(), req.user.id);
    if (taken) return res.status(400).json({ error: 'Username already taken' });
    updates.push('username = ?'); values.push(username.trim().toLowerCase());
  }
  if (featured_habit_id !== undefined) {
    // null clears the feature; otherwise verify it belongs to this user
    if (featured_habit_id === null || featured_habit_id === '') {
      updates.push('featured_habit_id = ?'); values.push(null);
    } else {
      const habit = getDb().prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(featured_habit_id, req.user.id);
      if (habit) { updates.push('featured_habit_id = ?'); values.push(featured_habit_id); }
    }
  }

  if (updates.length > 0) {
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const user = db.prepare(
    'SELECT id, username, email, display_name, bio, avatar_url, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json(user);
});

// PATCH /api/users/profile/featured-habit
router.patch('/profile/featured-habit', authMiddleware, (req, res) => {
  const db = getDb();
  const { habit_id } = req.body; // null to clear, habit UUID to set

  if (habit_id) {
    const habit = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ? AND is_active = 1').get(habit_id, req.user.id);
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
  }

  db.prepare('UPDATE users SET featured_habit_id = ? WHERE id = ?').run(habit_id ?? null, req.user.id);
  res.json({ ok: true });
});

// GET /api/users/:username/badges — all earned badges with habit info + all badge defs (for locked view)
router.get('/:username/badges', optionalAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Earned = currently active streak qualifies (not historical)
  const activeHabits = db.prepare(
    'SELECT id, name, color, frequency FROM habits WHERE user_id = ? AND is_active = 1'
  ).all(user.id);

  const activelyEarned = new Map(); // badge_type -> { habit_name, habit_color }
  for (const habit of activeHabits) {
    const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(habit.id);
    const streak = calculateStreak(logs, habit.frequency);
    for (const def of BADGE_DEFS) {
      if (def.freq && def.freq !== habit.frequency) continue;
      if (def.check(streak) && !activelyEarned.has(def.type)) {
        activelyEarned.set(def.type, { habit_name: habit.name, habit_color: habit.color });
      }
    }
  }

  // Still return DB badges for pinning/post badge picker
  const earned = db.prepare(`
    SELECT b.*, h.name as habit_name, h.color as habit_color, h.frequency as habit_frequency
    FROM badges b
    LEFT JOIN habits h ON h.id = b.habit_id
    WHERE b.user_id = ?
    ORDER BY b.awarded_at DESC
  `).all(user.id);

  // All badge defs — earned flag reflects CURRENT streak, not historical
  const all = BADGE_DEFS.map(def => {
    const active = activelyEarned.get(def.type);
    return {
      ...def,
      earned: !!active,
      habit_name: active?.habit_name ?? null,
      habit_color: active?.habit_color ?? null,
    };
  });

  res.json({ earned, all });
});

// PATCH /api/users/profile/badges/:id/pin — toggle pin on a badge (max 1 pinned)
router.patch('/profile/badges/:id/pin', authMiddleware, (req, res) => {
  const db = getDb();
  const badge = db.prepare('SELECT * FROM badges WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!badge) return res.status(404).json({ error: 'Badge not found' });

  if (!badge.pinned) {
    // Unpin any currently pinned badge first
    db.prepare('UPDATE badges SET pinned = 0 WHERE user_id = ? AND pinned = 1').run(req.user.id);
  }

  db.prepare('UPDATE badges SET pinned = ? WHERE id = ?').run(badge.pinned ? 0 : 1, badge.id);
  res.json({ pinned: !badge.pinned });
});

// POST /api/users/:id/follow
router.post('/:id/follow', authMiddleware, (req, res) => {
  const db = getDb();
  const targetId = req.params.id;
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot follow yourself' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, targetId);
  if (!existing) {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, targetId);

    // Notify
    db.prepare(
      "INSERT INTO notifications (id, user_id, type, from_user_id) VALUES (?, ?, 'follow', ?)"
    ).run(uuidv4(), targetId, req.user.id);

    // Push
    const actor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
    sendPush(targetId, {
      title: 'New follower',
      body: `${actor?.display_name || 'Someone'} started following you.`,
      data: { type: 'follow', userId: req.user.id },
    }, 'follows');

    // Badge: social butterfly (50 followers)
    const fc = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(targetId).c;
    if (fc >= 50) {
      db.prepare('INSERT OR IGNORE INTO badges (id, user_id, badge_type) VALUES (?, ?, ?)').run(uuidv4(), targetId, 'social_butterfly');
    }
  }

  res.json({ following: true });
});

// DELETE /api/users/:id/follow
router.delete('/:id/follow', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, req.params.id);
  res.json({ following: false });
});

// GET /api/users/:username/followers
router.get('/:username/followers', optionalAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const followers = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM follows f JOIN users u ON u.id = f.follower_id
     WHERE f.following_id = ? ORDER BY f.created_at DESC LIMIT 50`
  ).all(user.id);
  res.json(followers);
});

// GET /api/users/:username/following
router.get('/:username/following', optionalAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const following = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM follows f JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 50`
  ).all(user.id);
  res.json(following);
});

// GET /api/users/:username/posts
router.get('/:username/posts', optionalAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const viewerId = req.user?.id ?? null;
  const posts = db.prepare(
    `SELECT p.*, u.username, u.display_name, u.avatar_url,
       (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
       (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
       (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as liked_by_me,
       h.name as habit_name, h.color as habit_color
     FROM posts p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN habits h ON h.id = p.habit_id
     WHERE p.user_id = ?
     ORDER BY p.created_at DESC LIMIT 30`
  ).all(viewerId, user.id);
  res.json(posts);
});

// GET /api/users/:username/habits
router.get('/:username/habits', optionalAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const isOwner = req.user?.id === user.id;
  const isFollowing = !isOwner && req.user
    ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, user.id)
    : false;

  const allHabits = db.prepare(
    'SELECT * FROM habits WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC'
  ).all(user.id);

  const habits = isOwner ? allHabits : allHabits.filter(h => {
    if (h.visibility_missed === 'private') return false;
    if (h.visibility_missed === 'friends' && !isFollowing) return false;
    return true;
  });

  const enriched = habits.map(h => {
    const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(h.id);
    const streak = calculateStreak(logs, h.frequency);
    const at_risk = isStreakAtRisk(logs, h.frequency);
    const total_logs = logs.length;
    return { ...h, streak, at_risk, total_logs };
  });

  res.json(enriched);
});

// ── /users/me — settings endpoints ───────────────────────────────────────────

// PATCH /api/users/me  (name, username, bio — no file upload; avatar still via PUT /profile)
router.patch('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const { display_name, username, bio } = req.body;

  if (username) {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
    }
    const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.toLowerCase(), req.user.id);
    if (taken) return res.status(409).json({ error: 'Username already taken' });
  }

  if (display_name !== undefined && display_name.trim().length > 50) {
    return res.status(400).json({ error: 'Display name must be 50 characters or fewer' });
  }
  if (bio !== undefined && bio.trim().length > 300) {
    return res.status(400).json({ error: 'Bio must be 300 characters or fewer' });
  }

  const updates = [];
  const values = [];
  if (display_name !== undefined) { updates.push('display_name = ?'); values.push(display_name.trim()); }
  if (username !== undefined)     { updates.push('username = ?');      values.push(username.toLowerCase()); }
  if (bio !== undefined)          { updates.push('bio = ?');           values.push(bio.trim()); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const user = db.prepare('SELECT id, username, email, display_name, bio, avatar_url, location, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// PATCH /api/users/me/location
router.patch('/me/location', authMiddleware, (req, res) => {
  const { location } = req.body;
  if (typeof location !== 'string') return res.status(400).json({ error: 'location required' });
  const db = getDb();
  db.prepare('UPDATE users SET location = ? WHERE id = ?').run(location.trim().slice(0, 100), req.user.id);
  res.json({ ok: true, location: location.trim() });
});

// PUT /api/users/me/push-token
router.put('/me/push-token', authMiddleware, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  const db = getDb();
  db.prepare('UPDATE users SET push_token = ? WHERE id = ?').run(token, req.user.id);
  res.json({ ok: true });
});

// PATCH /api/users/me/notifications  — saves push notification preferences
router.patch('/me/notifications', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE users SET notify_prefs = ? WHERE id = ?').run(JSON.stringify(req.body), req.user.id);
  res.json({ ok: true });
});

// PATCH /api/users/me/privacy
router.patch('/me/privacy', authMiddleware, (req, res) => {
  const { default_habit_visibility, rsvp_private } = req.body;
  const db = getDb();
  if (default_habit_visibility !== undefined) {
    if (!['public', 'friends', 'private'].includes(default_habit_visibility)) {
      return res.status(400).json({ error: 'Invalid visibility value' });
    }
    db.prepare('UPDATE users SET default_habit_visibility = ? WHERE id = ?').run(default_habit_visibility, req.user.id);
  }
  if (rsvp_private !== undefined) {
    db.prepare('UPDATE users SET rsvp_private = ? WHERE id = ?').run(rsvp_private ? 1 : 0, req.user.id);
  }
  res.json({ ok: true });
});

// PATCH /api/users/me/password
router.patch('/me/password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const bcrypt = require('bcryptjs');
  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  res.json({ ok: true });
});

// PATCH /api/users/me/email
router.patch('/me/email', authMiddleware, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const bcrypt = require('bcryptjs');
  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Password is incorrect' });
  }

  const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase(), req.user.id);
  if (taken) return res.status(409).json({ error: 'Email already in use' });

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.toLowerCase(), req.user.id);
  res.json({ ok: true });
});

// POST /api/users/me/deactivate
router.post('/me/deactivate', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE users SET is_deactivated = 1 WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// DELETE /api/users/me — permanent account deletion
router.delete('/me', authMiddleware, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required to delete account' });

  const bcrypt = require('bcryptjs');
  const db = getDb();
  const account = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(password, account.password_hash)) {
    return res.status(401).json({ error: 'Password is incorrect' });
  }

  const id = req.user.id;

  // Delete in dependency order
  db.prepare('DELETE FROM likes WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM comments WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE user_id = ?)').run(id);
  db.prepare('DELETE FROM habits WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM posts WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').run(id, id);
  db.prepare('DELETE FROM badges WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM challenge_members WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);

  res.json({ ok: true });
});

module.exports = router;
