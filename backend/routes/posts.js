const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { sendPush } = require('../utils/push');

const router = express.Router();

function enrichPost(db, post, viewerId) {
  const liked_by_me = viewerId
    ? !!db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, viewerId)
    : false;
  const cheered_by_me = viewerId
    ? !!db.prepare('SELECT 1 FROM cheers WHERE post_id = ? AND user_id = ?').get(post.id, viewerId)
    : false;
  return { ...post, liked_by_me, cheered_by_me };
}

function buildPostQuery(whereClause, userId) {
  return `
    SELECT p.*,
      u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
      (SELECT COUNT(*) FROM cheers WHERE post_id = p.id) as cheer_count,
      h.name as habit_name, h.color as habit_color, h.frequency as habit_frequency
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN habits h ON h.id = p.habit_id
    ${whereClause}
    ORDER BY p.created_at DESC
  `;
}

// GET /api/posts — following feed
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = db.prepare(
    buildPostQuery(`WHERE (p.user_id IN (
      SELECT following_id FROM follows WHERE follower_id = ?
    ) OR p.user_id = ?)`) + ' LIMIT ? OFFSET ?'
  ).all(req.user.id, req.user.id, limit, offset);

  res.json(posts.map(p => enrichPost(db, p, req.user.id)));
});

// GET /api/posts/explore — global explore feed (plain, for HomeScreen tab)
router.get('/explore', optionalAuth, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = db.prepare(
    buildPostQuery('') + ' LIMIT ? OFFSET ?'
  ).all(limit, offset);

  res.json(posts.map(p => enrichPost(db, p, req.user?.id)));
});

// GET /api/posts/for-you — explore discovery feed
router.get('/for-you', optionalAuth, (req, res) => {
  const db = getDb();
  const userId = req.user?.id;

  const now = Date.now();
  const oneDayAgo = new Date(now - 86400000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();

  // Exclude own posts and people you already follow (explore = discovery)
  const followedIds = userId
    ? new Set(db.prepare('SELECT following_id FROM follows WHERE follower_id = ?').all(userId).map(f => f.following_id))
    : new Set();

  const excludeIds = userId ? [userId, ...[...followedIds]] : [];
  let whereClause;
  let queryParams;
  if (excludeIds.length > 0) {
    whereClause = `WHERE p.created_at > ? AND p.user_id NOT IN (${excludeIds.map(() => '?').join(',')})`;
    queryParams = [sevenDaysAgo, ...excludeIds];
  } else {
    whereClause = 'WHERE p.created_at > ?';
    queryParams = [sevenDaysAgo];
  }

  const candidates = db.prepare(
    buildPostQuery(whereClause) + ' LIMIT 200'
  ).all(...queryParams);

  if (!userId) {
    // Unauthenticated: recency + engagement
    const scored = candidates
      .map(p => ({ ...p, liked_by_me: false, score: (p.like_count || 0) * 2 + (p.comment_count || 0) * 3 + Math.random() * 8 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
    return res.json(scored);
  }

  // Velocity: recent engagement in last 24h
  const recentLikesMap = new Map(
    db.prepare('SELECT post_id, COUNT(*) as c FROM likes WHERE created_at > ? GROUP BY post_id').all(oneDayAgo)
      .map(r => [r.post_id, r.c])
  );
  const recentCommentsMap = new Map(
    db.prepare('SELECT post_id, COUNT(*) as c FROM comments WHERE created_at > ? GROUP BY post_id').all(oneDayAgo)
      .map(r => [r.post_id, r.c])
  );

  // Posts already liked by this user
  const likedIds = new Set(
    db.prepare('SELECT post_id FROM likes WHERE user_id = ?').all(userId).map(l => l.post_id)
  );

  // Friend-of-friend
  const fofIds = followedIds.size > 0
    ? new Set(
        db.prepare(
          `SELECT following_id FROM follows WHERE follower_id IN (${[...followedIds].map(() => '?').join(',')}) AND following_id != ?`
        ).all(...[...followedIds], userId).map(f => f.following_id)
      )
    : new Set();

  // User's active habits — track best streak per frequency for aspirational matching
  const userHabits = db.prepare('SELECT * FROM habits WHERE user_id = ? AND is_active = 1').all(userId);
  const myStreakByFreq = {};
  for (const habit of userHabits) {
    const logs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(habit.id);
    const streak = calculateStreak(logs, habit.frequency);
    if (!myStreakByFreq[habit.frequency] || streak > myStreakByFreq[habit.frequency]) {
      myStreakByFreq[habit.frequency] = streak;
    }
  }
  const myHabitFreqs = new Set(Object.keys(myStreakByFreq));

  // Freshness multiplier — rewards newer posts
  const freshnessMultiplier = (createdAt) => {
    const ageHours = (now - new Date(createdAt).getTime()) / 3600000;
    if (ageHours < 6) return 1.0;
    if (ageHours < 24) return 0.85;
    if (ageHours < 72) return 0.65;
    return 0.4;
  };

  const scored = candidates.map(p => {
    let score = 0;

    // Velocity: recent engagement worth more
    score += (recentLikesMap.get(p.id) || 0) * 5;
    score += (recentCommentsMap.get(p.id) || 0) * 7;

    // Older engagement (total minus recent)
    score += Math.max(0, (p.like_count || 0) - (recentLikesMap.get(p.id) || 0)) * 1;
    score += Math.max(0, (p.comment_count || 0) - (recentCommentsMap.get(p.id) || 0)) * 2;

    // Habit frequency match
    if (p.habit_frequency && myHabitFreqs.has(p.habit_frequency)) {
      score += 15;

      // Aspirational: poster is further along the same frequency habit than you
      const myStreak = myStreakByFreq[p.habit_frequency] || 0;
      const postHabitDay = p.habit_day || 0;
      if (postHabitDay > 0 && postHabitDay > myStreak) {
        score += postHabitDay > myStreak * 2 ? 35 : 20;
      }
    }

    // Habit day milestones
    if ((p.habit_day || 0) > 30) score += 10;
    else if ((p.habit_day || 0) > 7) score += 5;

    // Social proximity
    if (fofIds.has(p.user_id)) score += 12;

    // Already liked — de-rank
    if (likedIds.has(p.id)) score -= 50;

    // Small random noise for variety on refresh
    score += Math.random() * 8;

    // Apply freshness multiplier
    score *= freshnessMultiplier(p.created_at);

    return { ...p, liked_by_me: likedIds.has(p.id), score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Diversity cap: max 2 posts per user so no one dominates
  const userPostCount = {};
  const result = [];
  for (const post of scored) {
    const count = userPostCount[post.user_id] || 0;
    if (count < 2) {
      result.push(post);
      userPostCount[post.user_id] = count + 1;
    }
    if (result.length >= 40) break;
  }

  res.json(result);
});

// POST /api/posts
router.post('/', authMiddleware, upload.single('image'), (req, res) => {
  const db = getDb();
  const { content, video_url, habit_id, habit_day } = req.body;
  if (!content && !req.file && !video_url) {
    return res.status(400).json({ error: 'Post must have content, image, or video' });
  }
  if (content && content.length > 2000) return res.status(400).json({ error: 'Post content must be 2000 characters or fewer' });
  if (video_url) {
    try {
      const parsed = new URL(video_url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Invalid video URL' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid video URL' });
    }
  }

  const image_url = req.file ? `/uploads/${req.file.filename}` : '';

  if (habit_id) {
    const habit = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(habit_id, req.user.id);
    if (!habit) return res.status(400).json({ error: 'Invalid habit' });
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO posts (id, user_id, content, image_url, video_url, habit_id, habit_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user.id, content || '', image_url, video_url || '', habit_id || null, parseInt(habit_day) || 0);

  const post = db.prepare(
    `SELECT p.*, u.username, u.display_name, u.avatar_url,
      0 as like_count, 0 as comment_count,
      h.name as habit_name, h.color as habit_color, h.frequency as habit_frequency
     FROM posts p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN habits h ON h.id = p.habit_id
     WHERE p.id = ?`
  ).get(id);

  res.status(201).json({ ...post, liked_by_me: false, cheer_count: 0, cheered_by_me: false });
});

// DELETE /api/posts/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// POST /api/posts/:id/like
router.post('/:id/like', authMiddleware, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const existing = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.user.id, req.params.id);
  if (!existing) {
    db.prepare('INSERT INTO likes (id, user_id, post_id) VALUES (?, ?, ?)').run(uuidv4(), req.user.id, req.params.id);

    if (post.user_id !== req.user.id) {
      db.prepare(
        "INSERT INTO notifications (id, user_id, type, from_user_id, post_id) VALUES (?, ?, 'like', ?, ?)"
      ).run(uuidv4(), post.user_id, req.user.id, req.params.id);
    }
  }

  const like_count = db.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(req.params.id).c;
  res.json({ liked: true, like_count });
});

// DELETE /api/posts/:id/like
router.delete('/:id/like', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.user.id, req.params.id);
  const like_count = db.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(req.params.id).c;
  res.json({ liked: false, like_count });
});

// GET /api/posts/:id/comments
router.get('/:id/comments', optionalAuth, (req, res) => {
  const db = getDb();
  const viewerId = req.user?.id;

  const comments = db.prepare(
    `SELECT c.*, u.username, u.display_name, u.avatar_url,
       (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as like_count
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? AND c.parent_id IS NULL
     ORDER BY like_count DESC, c.created_at ASC`
  ).all(req.params.id);

  const withReplies = comments.map(c => {
    const liked_by_me = viewerId
      ? !!db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(c.id, viewerId)
      : false;

    const replies = db.prepare(
      `SELECT c.*, u.username, u.display_name, u.avatar_url,
         (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as like_count
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.parent_id = ?
       ORDER BY c.created_at ASC`
    ).all(c.id).map(r => ({
      ...r,
      liked_by_me: viewerId
        ? !!db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(r.id, viewerId)
        : false,
    }));

    return { ...c, liked_by_me, replies };
  });

  res.json(withReplies);
});

// POST /api/posts/:id/comments/:commentId/like
router.post('/:id/comments/:commentId/like', authMiddleware, (req, res) => {
  const db = getDb();
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const existing = db.prepare('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?').get(req.user.id, req.params.commentId);
  if (!existing) {
    db.prepare('INSERT INTO comment_likes (id, user_id, comment_id) VALUES (?, ?, ?)').run(uuidv4(), req.user.id, req.params.commentId);
  }

  const like_count = db.prepare('SELECT COUNT(*) as c FROM comment_likes WHERE comment_id = ?').get(req.params.commentId).c;
  res.json({ liked: true, like_count });
});

// DELETE /api/posts/:id/comments/:commentId/like
router.delete('/:id/comments/:commentId/like', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?').run(req.user.id, req.params.commentId);
  const like_count = db.prepare('SELECT COUNT(*) as c FROM comment_likes WHERE comment_id = ?').get(req.params.commentId).c;
  res.json({ liked: false, like_count });
});

// POST /api/posts/:id/comments
router.post('/:id/comments', authMiddleware, (req, res) => {
  const db = getDb();
  const { content, parent_id } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (content.length > 1000) return res.status(400).json({ error: 'Comment must be 1000 characters or fewer' });

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const id = uuidv4();
  db.prepare(
    'INSERT INTO comments (id, user_id, post_id, parent_id, content) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user.id, req.params.id, parent_id || null, content.trim());

  if (post.user_id !== req.user.id) {
    db.prepare(
      "INSERT INTO notifications (id, user_id, type, from_user_id, post_id) VALUES (?, ?, 'comment', ?, ?)"
    ).run(uuidv4(), post.user_id, req.user.id, req.params.id);

    const actor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
    sendPush(post.user_id, {
      title: 'New comment',
      body: `${actor?.display_name || 'Someone'} commented on your post.`,
      data: { type: 'comment', postId: req.params.id },
    }, 'comments');
  }

  const comment = db.prepare(
    `SELECT c.*, u.username, u.display_name, u.avatar_url
     FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`
  ).get(id);

  res.status(201).json({ ...comment, replies: [] });
});

// POST /api/posts/:id/cheer
router.post('/:id/cheer', authMiddleware, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const existing = db.prepare('SELECT 1 FROM cheers WHERE user_id = ? AND post_id = ?').get(req.user.id, req.params.id);
  if (!existing) {
    db.prepare('INSERT INTO cheers (id, user_id, post_id) VALUES (?, ?, ?)').run(uuidv4(), req.user.id, req.params.id);
    if (post.user_id !== req.user.id) {
      db.prepare(
        "INSERT INTO notifications (id, user_id, type, from_user_id, post_id) VALUES (?, ?, 'cheer', ?, ?)"
      ).run(uuidv4(), post.user_id, req.user.id, req.params.id);

      const actor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
      sendPush(post.user_id, {
        title: 'Someone cheered you on',
        body: `${actor?.display_name || 'Someone'} cheered your post.`,
        data: { type: 'cheer', postId: req.params.id },
      }, 'cheers');
    }
  }
  const cheer_count = db.prepare('SELECT COUNT(*) as c FROM cheers WHERE post_id = ?').get(req.params.id).c;
  res.json({ cheered: true, cheer_count });
});

// DELETE /api/posts/:id/cheer
router.delete('/:id/cheer', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM cheers WHERE user_id = ? AND post_id = ?').run(req.user.id, req.params.id);
  const cheer_count = db.prepare('SELECT COUNT(*) as c FROM cheers WHERE post_id = ?').get(req.params.id).c;
  res.json({ cheered: false, cheer_count });
});

// DELETE /api/posts/:id/comments/:commentId
router.delete('/:id/comments/:commentId', authMiddleware, (req, res) => {
  const db = getDb();
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.commentId);
  res.json({ deleted: true });
});

module.exports = router;
