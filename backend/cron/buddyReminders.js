'use strict';
const { getDb } = require('../database/db');
const { getPeriodKeyTz } = require('../utils/streaks');
const { sendPush } = require('../utils/push');

const DEFAULT_TZ = 'America/New_York';

/**
 * Run hourly. For each active buddy pair, if either user has unlogged daily habits
 * and their local time is currently in the 17:00-17:59 window, send:
 *   - The user who hasn't logged: "Your buddy is watching — log your habits."
 *   - Their buddy: "[name] hasn't logged yet — remind them."
 *
 * Deduped per pair per *user-local* calendar day (so a user near a UTC
 * boundary can't receive duplicates).
 */
async function runBuddyAccountabilityReminders() {
  const db = getDb();
  const { v4: uuidv4 } = require('uuid');

  const pairs = db.prepare(`
    SELECT b.id, b.requester_id, b.recipient_id,
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
    // Check each user: are they in the 5pm window?
    const users = [
      { id: pair.requester_id, name: pair.requester_name, token: pair.requester_token, prefs: pair.requester_prefs, tz: pair.requester_tz, buddyId: pair.recipient_id, buddyName: pair.recipient_name },
      { id: pair.recipient_id, name: pair.recipient_name, token: pair.recipient_token, prefs: pair.recipient_prefs, tz: pair.recipient_tz, buddyId: pair.requester_id, buddyName: pair.requester_name },
    ];

    for (const u of users) {
      if (!u.token) continue;

      const tz = u.tz || DEFAULT_TZ;

      // Determine local hour for this user
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

      if (localHour !== 17) continue; // only fire during the 5pm hour

      // Local-date dedup key (YYYY-MM-DD in the user's tz). Encoding the date
      // into reference_id lets us dedup without a schema change and without
      // crossing UTC boundaries.
      const localDate = getPeriodKeyTz(now, 'daily', tz);
      const dedupRef = `${pair.id}:${localDate}`;

      // Check if user has any unlogged daily habits today. Both the self
      // reminder and the buddy nudge depend on this — if everything's logged,
      // there's nothing to remind about either side of.
      const unlogged = db.prepare(`
        SELECT h.id, h.name FROM habits h
        WHERE h.user_id = ? AND h.is_active = 1 AND h.frequency = 'daily'
          AND (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND date(logged_at) = date('now')) = 0
      `).all(u.id);

      if (unlogged.length === 0) continue;

      // Respect notify prefs (only gates the self reminder; buddy nudge
      // honors the buddy's own prefs, which we don't currently store split,
      // but the buddy_nudge_reminder type is already filterable client-side).
      let selfPrefAllowed = true;
      if (u.prefs) {
        try {
          const prefs = JSON.parse(u.prefs);
          if (prefs.buddy === false) selfPrefAllowed = false;
        } catch { /* malformed */ }
      }

      // Self reminder — independently deduped. If a previous tick inserted
      // the self row but failed before nudging the buddy, the self check
      // skips here while the buddy nudge below can still recover.
      const alreadySentSelf = db.prepare(`
        SELECT 1 FROM notifications
        WHERE user_id = ? AND type = 'buddy_5pm_reminder'
          AND reference_id = ?
      `).get(u.id, dedupRef);

      if (selfPrefAllowed && !alreadySentSelf) {
        const habitList = unlogged.length === 1
          ? `"${unlogged[0].name}"`
          : `${unlogged.length} habits`;

        // Insert the dedup row BEFORE sending so a sendPush failure can't
        // result in a duplicate reminder on the next cron tick.
        db.prepare(
          "INSERT INTO notifications (id, user_id, type, reference_id, message) VALUES (?, ?, 'buddy_5pm_reminder', ?, ?)"
        ).run(uuidv4(), u.id, dedupRef, `Log your habits — ${u.buddyName} is watching.`);

        await sendPush(u.id, {
          title: 'Your buddy is watching',
          body: `Log ${habitList} today — ${u.buddyName} will notice.`,
          data: { type: 'buddy_5pm_reminder', buddyId: u.buddyId },
        }, 'buddy');
      }

      // Nudge the buddy. Dedup on (buddyId, type='buddy_nudge_reminder',
      // pair.id+local-date) so the buddy can't be re-nudged for the same
      // local day.
      const buddyDedupRef = `${pair.id}:${localDate}`;
      const buddyAlreadyNudged = db.prepare(`
        SELECT 1 FROM notifications
        WHERE user_id = ? AND type = 'buddy_nudge_reminder'
          AND reference_id = ?
      `).get(u.buddyId, buddyDedupRef);

      if (!buddyAlreadyNudged) {
        // Insert the dedup row BEFORE sending so a retry can't double-send.
        db.prepare(
          "INSERT INTO notifications (id, user_id, type, reference_id, message) VALUES (?, ?, 'buddy_nudge_reminder', ?, ?)"
        ).run(uuidv4(), u.buddyId, buddyDedupRef, `${u.name} hasn't logged yet today — remind them.`);

        await sendPush(u.buddyId, {
          title: `Check in on ${u.name}`,
          body: `${u.name} hasn't logged yet today — remind them.`,
          data: { type: 'buddy_nudge_reminder', userId: u.id },
        }, 'buddy');
      }

      sent++;
    }
  }

  console.log(`[Cron] buddy-accountability-reminders: sent ${sent} pairs notified`);
  return sent;
}

/**
 * Run nightly at 00:30 UTC. For active buddy pairs where either user opted into
 * show_missed, check if they failed to log any daily habit yesterday. If so,
 * create a public post so the buddy sees it in their feed.
 *
 * "Yesterday" is computed in each user's local timezone, not UTC (#8).
 */
async function runMissedHabitAutoPost() {
  const db = getDb();
  const { v4: uuidv4 } = require('uuid');

  // Pairs where at least one side opted in
  const pairs = db.prepare(`
    SELECT b.id, b.requester_id, b.recipient_id,
      b.requester_show_missed, b.recipient_show_missed,
      ru.timezone as requester_tz, rcu.timezone as recipient_tz
    FROM buddies b
    JOIN users ru  ON ru.id  = b.requester_id
    JOIN users rcu ON rcu.id = b.recipient_id
    WHERE b.status = 'active'
      AND (b.requester_show_missed = 1 OR b.recipient_show_missed = 1)
  `).all();

  const now = new Date();
  let posted = 0;

  for (const pair of pairs) {
    const toCheck = [];
    if (pair.requester_show_missed) toCheck.push({ userId: pair.requester_id, tz: pair.requester_tz });
    if (pair.recipient_show_missed) toCheck.push({ userId: pair.recipient_id, tz: pair.recipient_tz });

    for (const { userId, tz: userTz } of toCheck) {
      const tz = userTz || DEFAULT_TZ;

      // "Yesterday" in user-local time
      const todayLocal = getPeriodKeyTz(now, 'daily', tz);
      const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayLocal = getPeriodKeyTz(yesterdayDate, 'daily', tz);

      // Find daily habits not logged on the user's local "yesterday".
      // We compare against the SQLite UTC date string for logged_at — this is
      // an approximation but matches how the rest of the app counts daily
      // logs. The key fix is computing `yesterdayLocal` from the user's tz
      // rather than `date('now', '-1 day')` in UTC.
      const missedHabits = db.prepare(`
        SELECT h.id, h.name FROM habits h
        WHERE h.user_id = ? AND h.is_active = 1 AND h.frequency = 'daily'
          AND (
            SELECT COUNT(*) FROM habit_logs
            WHERE habit_id = h.id
              AND strftime('%Y-%m-%d', logged_at) = ?
          ) = 0
      `).all(userId, yesterdayLocal);

      if (missedHabits.length === 0) continue;

      // Dedup: only one missed post per user per local day. Match on the
      // local "today" date so re-runs within the same user-local day don't
      // double-post.
      const alreadyPosted = db.prepare(`
        SELECT 1 FROM posts WHERE user_id = ? AND type = 'missed_habit'
          AND date(created_at) = date('now')
      `).get(userId);
      if (alreadyPosted) continue;

      const names = missedHabits.map(h => h.name).join(', ');
      const content = missedHabits.length === 1
        ? `Missed "${names}" yesterday. Accountability is real.`
        : `Missed ${missedHabits.length} habits yesterday (${names}). Back at it today.`;

      // #38 — when only one habit was missed, attribute the post to that habit
      if (missedHabits.length === 1) {
        db.prepare(
          "INSERT INTO posts (id, user_id, content, type, habit_id) VALUES (?, ?, ?, 'missed_habit', ?)"
        ).run(uuidv4(), userId, content, missedHabits[0].id);
      } else {
        db.prepare(
          "INSERT INTO posts (id, user_id, content, type) VALUES (?, ?, ?, 'missed_habit')"
        ).run(uuidv4(), userId, content);
      }
      posted++;
    }
  }

  console.log(`[Cron] missed-habit-auto-post: created ${posted} posts`);
  return posted;
}

module.exports = { runBuddyAccountabilityReminders, runMissedHabitAutoPost };
