'use strict';
const { getDb } = require('../database/db');
const { getPeriodKeyTz } = require('../utils/streaks');
const { sendPush } = require('../utils/push');
const { computeJointStreak } = require('../routes/buddies');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_TZ = 'America/New_York';
const FIRE_HOUR = 20; // 8pm local
const MIN_STREAK_TO_WARN = 2; // don't bother nudging for a 1-day streak

/**
 * Hourly cron. For each active buddy pair, when it's currently 8pm in a user's
 * local tz, check if their joint streak is at risk (alive but today isn't yet
 * a joint day). If so, push: "Your X-day streak with Joe ends at midnight."
 *
 * Dedup per pair per user-local day so a re-run inside the same hour can't
 * double-send. Notification row is inserted before the push so a retry after
 * push fail still records the dedup key.
 */
async function runJointStreakAtRisk() {
  const db = getDb();

  const pairs = db.prepare(`
    SELECT b.id, b.requester_id, b.recipient_id, b.last_freeze_used_at,
      ru.display_name as requester_name, ru.push_token as requester_token,
      ru.notify_prefs as requester_prefs, ru.timezone as requester_tz,
      rcu.display_name as recipient_name, rcu.push_token as recipient_token,
      rcu.notify_prefs as recipient_prefs, rcu.timezone as recipient_tz
    FROM buddies b
    JOIN users ru  ON ru.id  = b.requester_id
    JOIN users rcu ON rcu.id = b.recipient_id
    WHERE b.status = 'active'
  `).all();

  const now = new Date();
  let sent = 0;

  for (const pair of pairs) {
    // computeJointStreak() may consume a freeze and persist `last_freeze_used_at`.
    // We pass the row as-is; it will return updated state.
    const joint = computeJointStreak(db, pair, pair.requester_id, pair.recipient_id);

    // No streak to lose, or already a joint day today → nothing to warn about.
    if (joint.streak < MIN_STREAK_TO_WARN) continue;
    if (joint.alive_today) continue;

    const sides = [
      { id: pair.requester_id, name: pair.requester_name, token: pair.requester_token, prefs: pair.requester_prefs, tz: pair.requester_tz, buddyName: pair.recipient_name },
      { id: pair.recipient_id, name: pair.recipient_name, token: pair.recipient_token, prefs: pair.recipient_prefs, tz: pair.recipient_tz, buddyName: pair.requester_name },
    ];

    for (const u of sides) {
      if (!u.token) continue;

      const tz = u.tz || DEFAULT_TZ;
      let localHour;
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: tz,
        });
        localHour = parseInt(formatter.format(now), 10) % 24;
      } catch {
        localHour = now.getUTCHours();
      }
      if (localHour !== FIRE_HOUR) continue;

      // Respect per-user buddy notification preference.
      if (u.prefs) {
        try {
          const prefs = JSON.parse(u.prefs);
          if (prefs.buddy === false) continue;
        } catch { /* malformed — fall through and send */ }
      }

      const localDate = getPeriodKeyTz(now, 'daily', tz);
      const dedupRef = `${pair.id}:${localDate}`;

      const already = db.prepare(`
        SELECT 1 FROM notifications
        WHERE user_id = ? AND type = 'joint_streak_at_risk' AND reference_id = ?
      `).get(u.id, dedupRef);
      if (already) continue;

      const body = `${u.buddyName} hasn't logged today — your ${joint.streak}-day streak ends at midnight.`;

      // Insert dedup row BEFORE the push so a push failure still records the send.
      db.prepare(
        "INSERT INTO notifications (id, user_id, type, reference_id, message) VALUES (?, ?, 'joint_streak_at_risk', ?, ?)"
      ).run(uuidv4(), u.id, dedupRef, body);

      await sendPush(u.id, {
        title: 'Your streak is at risk',
        body,
        data: { type: 'joint_streak_at_risk', buddyName: u.buddyName, streak: joint.streak },
      }, 'buddy');

      sent++;
    }
  }

  console.log(`[Cron] joint-streak-at-risk: ${sent} warnings sent`);
  return sent;
}

module.exports = { runJointStreakAtRisk };
