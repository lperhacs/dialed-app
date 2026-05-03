const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { sendPush } = require('../utils/push');
const { trackEvent, metaFromReq } = require('../utils/analytics');

const router = express.Router();

const FREE_BUDDY_LIMIT = 1;
const PRO_BUDDY_LIMIT  = 3;

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

function getActiveBuddyCount(db, userId) {
  return db.prepare(
    "SELECT COUNT(*) as c FROM buddies WHERE (requester_id = ? OR recipient_id = ?) AND status = 'active'"
  ).get(userId, userId).c;
}

// Joint buddy streak: count consecutive UTC days where BOTH buddies logged ≥1 habit.
// Pair gets 1 freeze per rolling 14 days — but ONLY when BOTH users are Pro.
// If either buddy is on the free plan, a single missed joint day breaks the
// streak (no freeze applied). When eligible, the freeze is consumed lazily on
// read; we persist `last_freeze_used_at` so the same freeze can't be replayed.
//
// Returns { streak, alive_today, at_risk, freeze_used_recently, freeze_eligible }.
//   alive_today=true means most recent joint day is today.
//   at_risk=true means streak is "alive" via yesterday's joint day but neither today,
//     or only one of the two has logged today (so a partner can still save it).
//   freeze_used_recently=true if the freeze that's keeping the streak alive falls
//     inside the current streak window — surface this in the UI so users know.
//   freeze_eligible=true when both buddies are Pro — used to drive upsell UI on Free.
function computeJointStreak(db, pair, userIdA, userIdB) {
  // Pro gate for freezes — both buddies must be Pro for the freeze to apply.
  const proRow = db.prepare(
    'SELECT (SELECT is_pro FROM users WHERE id = ?) as a_pro, (SELECT is_pro FROM users WHERE id = ?) as b_pro'
  ).get(userIdA, userIdB);
  const freezeEligible = !!(proRow?.a_pro && proRow?.b_pro);
  const aDays = db.prepare(
    "SELECT DISTINCT date(logged_at) as d FROM habit_logs WHERE user_id = ?"
  ).all(userIdA).map(r => r.d);
  const bDaysSet = new Set(db.prepare(
    "SELECT DISTINCT date(logged_at) as d FROM habit_logs WHERE user_id = ?"
  ).all(userIdB).map(r => r.d));

  const jointSet = new Set(aDays.filter(d => bDaysSet.has(d)));
  if (jointSet.size === 0) {
    return { streak: 0, alive_today: false, at_risk: false, freeze_used_recently: false, freeze_eligible: freezeEligible };
  }

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Anchor — most recent joint day must be today or yesterday for the streak to be alive.
  const sortedDesc = [...jointSet].sort().reverse();
  const anchor = sortedDesc[0];
  if (anchor !== today && anchor !== yesterday) {
    return { streak: 0, alive_today: false, at_risk: false, freeze_used_recently: false, freeze_eligible: freezeEligible };
  }

  const dayBefore = (d) => new Date(new Date(d).getTime() - 86400000).toISOString().split('T')[0];
  const isWithin14 = (a, b) => Math.abs(new Date(a) - new Date(b)) <= 14 * 86400000;

  let lastFreezeUsedAt = pair?.last_freeze_used_at || null;
  let freezeUsedRecently = false;
  let pendingFreezeWrite = null; // YYYY-MM-DD if we consumed a freeze this read

  let streak = 1;
  let cursor = anchor;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const expected = dayBefore(cursor);
    if (jointSet.has(expected)) {
      streak++;
      cursor = expected;
      continue;
    }
    // Gap. Try to apply a freeze.
    // Free plan: no freezes ever — gap breaks the streak immediately.
    if (!freezeEligible) break;

    // Already-spent freeze landing exactly on this gap → already paid for, walk past it.
    if (lastFreezeUsedAt === expected) {
      freezeUsedRecently = true;
      cursor = expected;
      continue;
    }
    // Eligible to consume a fresh freeze: never used, OR last use is >14 days from this gap.
    const eligible = !lastFreezeUsedAt || !isWithin14(lastFreezeUsedAt, expected);
    if (eligible) {
      pendingFreezeWrite = expected;
      lastFreezeUsedAt = expected;
      freezeUsedRecently = true;
      cursor = expected;
      continue;
    }
    break;
  }

  // Persist the freeze consumption (if any) so it can't be replayed on next read.
  if (pendingFreezeWrite && pair?.id) {
    try {
      db.prepare('UPDATE buddies SET last_freeze_used_at = ? WHERE id = ?')
        .run(pendingFreezeWrite, pair.id);
    } catch (_) { /* best-effort — never fail a read over a freeze write */ }
  }

  // At-risk: alive via yesterday only — one or both haven't logged today.
  const aLoggedToday = aDays.includes(today);
  const bLoggedToday = bDaysSet.has(today);
  const at_risk = anchor === yesterday || !aLoggedToday || !bLoggedToday;

  return {
    streak,
    alive_today: anchor === today,
    at_risk,
    freeze_used_recently: freezeUsedRecently,
    freeze_eligible: freezeEligible,
  };
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

  // Buddies can see all habits except explicitly private ones
  const buddyHabits = db.prepare(`
    SELECT h.id, h.name, h.color, h.frequency, h.visibility_missed,
      (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND date(logged_at) = date('now')) as logged_today,
      (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id) as total_logs
    FROM habits h WHERE h.user_id = ? AND h.is_active = 1
      AND h.visibility_missed != 'private'
    ORDER BY h.created_at ASC
  `).all(buddy.buddy_user_id);

  const myHabits = db.prepare(`
    SELECT h.id, h.name, h.color, h.frequency,
      (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND date(logged_at) = date('now')) as logged_today,
      (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id) as total_logs
    FROM habits h WHERE h.user_id = ? AND h.is_active = 1 ORDER BY h.created_at ASC
  `).all(userId);

  const myShowMissed = buddy.requester_id === userId
    ? !!buddy.requester_show_missed
    : !!buddy.recipient_show_missed;

  const joint = computeJointStreak(db, buddy, userId, buddy.buddy_user_id);

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
    my_show_missed: myShowMissed,
    joint_streak: joint.streak,
    joint_streak_alive_today: joint.alive_today,
    joint_streak_at_risk: joint.at_risk,
    joint_streak_freeze_used_recently: joint.freeze_used_recently,
    joint_streak_freeze_eligible: joint.freeze_eligible,
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

  // Pro plan gating — pre-check for fast-fail with a clear error/pro_gate.
  const requester = db.prepare('SELECT is_pro FROM users WHERE id = ?').get(req.user.id);
  const myLimit = requester?.is_pro ? PRO_BUDDY_LIMIT : FREE_BUDDY_LIMIT;
  const myCountPre = getActiveBuddyCount(db, req.user.id);
  if (myCountPre >= myLimit) {
    return res.status(403).json({
      error: myLimit === FREE_BUDDY_LIMIT
        ? 'Free plan allows 1 buddy. Upgrade to Dialed Pro for up to 3 buddies.'
        : 'You have reached the maximum of 3 active buddies.',
      pro_gate: !requester?.is_pro,
    });
  }
  const recipient = db.prepare('SELECT is_pro FROM users WHERE id = ?').get(user_id);
  const theirLimit = recipient?.is_pro ? PRO_BUDDY_LIMIT : FREE_BUDDY_LIMIT;
  const theirCountPre = getActiveBuddyCount(db, user_id);
  if (theirCountPre >= theirLimit) return res.status(400).json({ error: 'This user has reached their buddy limit' });

  const existing = db.prepare(
    'SELECT * FROM buddies WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)'
  ).get(req.user.id, user_id, user_id, req.user.id);

  if (existing?.status === 'pending') return res.status(400).json({ error: 'Request already sent' });

  // Re-check counts INSIDE a transaction to close the race window where two
  // concurrent requests both passed the pre-check and would each insert.
  const id = uuidv4();
  db.exec('BEGIN IMMEDIATE');
  try {
    const myCount = getActiveBuddyCount(db, req.user.id);
    if (myCount >= myLimit) {
      db.exec('ROLLBACK');
      return res.status(403).json({
        error: myLimit === FREE_BUDDY_LIMIT
          ? 'Free plan allows 1 buddy. Upgrade to Dialed Pro for up to 3 buddies.'
          : 'You have reached the maximum of 3 active buddies.',
        pro_gate: !requester?.is_pro,
      });
    }
    const theirCount = getActiveBuddyCount(db, user_id);
    if (theirCount >= theirLimit) {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: 'This user has reached their buddy limit' });
    }
    db.prepare("INSERT OR REPLACE INTO buddies (id, requester_id, recipient_id, status) VALUES (?, ?, ?, 'pending')")
      .run(id, req.user.id, user_id);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  }

  db.prepare(
    "INSERT INTO notifications (id, user_id, type, from_user_id, message) VALUES (?, ?, 'buddy_request', ?, ?)"
  ).run(uuidv4(), user_id, req.user.id, 'wants to be your accountability buddy');

  const actor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
  sendPush(user_id, {
    title: 'Buddy request',
    body: `${actor?.display_name || 'Someone'} wants to be your accountability buddy.`,
    data: { type: 'buddy_request', userId: req.user.id },
  }, 'buddy');

  trackEvent(req.user.id, 'buddy_request_sent', {}, metaFromReq(req));
  res.json({ requested: true, id });
});

// PUT /api/buddies/:id/accept
router.put('/:id/accept', authMiddleware, (req, res) => {
  const db = getDb();
  const buddy = db.prepare("SELECT * FROM buddies WHERE id = ? AND recipient_id = ? AND status = 'pending'")
    .get(req.params.id, req.user.id);
  if (!buddy) return res.status(404).json({ error: 'Request not found' });

  // recipient_show_missed: did the accepter opt in to showing misses to their buddy?
  const recipientShowMissed = req.body.show_missed ? 1 : 0;
  db.prepare("UPDATE buddies SET status = 'active', recipient_show_missed = ? WHERE id = ?")
    .run(recipientShowMissed, req.params.id);

  db.prepare(
    "INSERT INTO notifications (id, user_id, type, from_user_id, message) VALUES (?, ?, 'buddy_accepted', ?, ?)"
  ).run(uuidv4(), buddy.requester_id, req.user.id, 'accepted your buddy request!');

  const actor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
  sendPush(buddy.requester_id, {
    title: 'Buddy accepted',
    body: `${actor?.display_name || 'Someone'} accepted your buddy request.`,
    data: { type: 'buddy_accepted', userId: req.user.id },
  }, 'buddy');

  trackEvent(req.user.id, 'buddy_accepted', {}, metaFromReq(req));
  res.json({ accepted: true });
});

// POST /api/buddies/:id/nudge — one-tap accountability nudge to your buddy
router.post('/:id/nudge', authMiddleware, (req, res) => {
  const db = getDb();
  const buddy = db.prepare(
    "SELECT * FROM buddies WHERE id = ? AND (requester_id = ? OR recipient_id = ?) AND status = 'active'"
  ).get(req.params.id, req.user.id, req.user.id);
  if (!buddy) return res.status(404).json({ error: 'Buddy not found' });

  const buddyUserId = buddy.requester_id === req.user.id ? buddy.recipient_id : buddy.requester_id;

  // Rate limit: 1 nudge per 4 hours per sender
  const recentNudge = db.prepare(`
    SELECT 1 FROM notifications
    WHERE user_id = ? AND type = 'buddy_nudge' AND from_user_id = ?
      AND created_at >= datetime('now', '-4 hours')
  `).get(buddyUserId, req.user.id);
  if (recentNudge) return res.status(429).json({ error: 'You can only nudge once every 4 hours' });

  const actor = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);

  db.prepare(
    "INSERT INTO notifications (id, user_id, type, from_user_id, message) VALUES (?, ?, 'buddy_nudge', ?, ?)"
  ).run(uuidv4(), buddyUserId, req.user.id, 'nudged you to log your habits!');

  sendPush(buddyUserId, {
    title: `${actor?.display_name || 'Your buddy'} is watching`,
    body: 'Your accountability partner sent you a nudge — go log your habits.',
    data: { type: 'buddy_nudge', userId: req.user.id },
  }, 'buddy');

  trackEvent(req.user.id, 'buddy_nudge_sent', {}, metaFromReq(req));
  res.json({ nudged: true });
});

// PATCH /api/buddies/:id/show-missed — toggle opt-in for missed habit auto-posts
router.patch('/:id/show-missed', authMiddleware, (req, res) => {
  const db = getDb();
  const buddy = db.prepare(
    "SELECT * FROM buddies WHERE id = ? AND (requester_id = ? OR recipient_id = ?) AND status = 'active'"
  ).get(req.params.id, req.user.id, req.user.id);
  if (!buddy) return res.status(404).json({ error: 'Buddy not found' });

  const { show_missed } = req.body;
  const val = show_missed ? 1 : 0;

  if (buddy.requester_id === req.user.id) {
    db.prepare('UPDATE buddies SET requester_show_missed = ? WHERE id = ?').run(val, req.params.id);
  } else {
    db.prepare('UPDATE buddies SET recipient_show_missed = ? WHERE id = ?').run(val, req.params.id);
  }

  res.json({ ok: true, show_missed: !!show_missed });
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
module.exports.computeJointStreak = computeJointStreak;
