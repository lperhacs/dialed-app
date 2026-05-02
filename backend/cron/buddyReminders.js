'use strict';
const { getDb } = require('../database/db');
const { sendPush } = require('../utils/push');

/**
 * Run hourly. For each active buddy pair, if either user has unlogged daily habits
 * and their local time is currently in the 17:00-17:59 window, send:
 *   - The user who hasn't logged: "Your buddy is watching — log your habits."
 *   - Their buddy: "[name] hasn't logged yet — remind them."
 *
 * Deduped per pair per calendar day.
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

      // Determine local hour for this user
      let localHour;
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: u.tz || 'UTC',
        });
        localHour = parseInt(formatter.format(now), 10);
      } catch {
        localHour = now.getUTCHours();
      }

      if (localHour !== 17) continue; // only fire during the 5pm hour

      // Check if already sent today for this pair
      const alreadySent = db.prepare(`
        SELECT 1 FROM notifications
        WHERE user_id = ? AND type = 'buddy_5pm_reminder'
          AND reference_id = ? AND created_at >= date('now', 'start of day')
      `).get(u.id, pair.id);
      if (alreadySent) continue;

      // Check if user has any unlogged daily habits today
      const unlogged = db.prepare(`
        SELECT h.id, h.name FROM habits h
        WHERE h.user_id = ? AND h.is_active = 1 AND h.frequency = 'daily'
          AND (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND date(logged_at) = date('now')) = 0
      `).all(u.id);

      if (unlogged.length === 0) continue;

      // Respect notify prefs
      if (u.prefs) {
        try {
          const prefs = JSON.parse(u.prefs);
          if (prefs.buddy === false) continue;
        } catch { /* malformed */ }
      }

      // Notify the user who hasn't logged
      const habitList = unlogged.length === 1
        ? `"${unlogged[0].name}"`
        : `${unlogged.length} habits`;

      await sendPush(u.id, {
        title: 'Your buddy is watching',
        body: `Log ${habitList} today — ${u.buddyName} will notice.`,
        data: { type: 'buddy_5pm_reminder', buddyId: u.buddyId },
      }, 'buddy');

      db.prepare(
        "INSERT INTO notifications (id, user_id, type, reference_id, message) VALUES (?, ?, 'buddy_5pm_reminder', ?, ?)"
      ).run(uuidv4(), u.id, pair.id, `Log your habits — ${u.buddyName} is watching.`);

      // Notify the buddy to nudge
      await sendPush(u.buddyId, {
        title: `Check in on ${u.name}`,
        body: `${u.name} hasn't logged yet today — remind them.`,
        data: { type: 'buddy_nudge_reminder', userId: u.id },
      }, 'buddy');

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
 */
async function runMissedHabitAutoPost() {
  const db = getDb();
  const { v4: uuidv4 } = require('uuid');

  // Pairs where at least one side opted in
  const pairs = db.prepare(`
    SELECT b.id, b.requester_id, b.recipient_id,
      b.requester_show_missed, b.recipient_show_missed
    FROM buddies b WHERE b.status = 'active'
      AND (b.requester_show_missed = 1 OR b.recipient_show_missed = 1)
  `).all();

  let posted = 0;

  for (const pair of pairs) {
    const toCheck = [];
    if (pair.requester_show_missed) toCheck.push(pair.requester_id);
    if (pair.recipient_show_missed) toCheck.push(pair.recipient_id);

    for (const userId of toCheck) {
      // Find daily habits not logged yesterday
      const missedHabits = db.prepare(`
        SELECT h.id, h.name FROM habits h
        WHERE h.user_id = ? AND h.is_active = 1 AND h.frequency = 'daily'
          AND (
            SELECT COUNT(*) FROM habit_logs
            WHERE habit_id = h.id
              AND date(logged_at) = date('now', '-1 day')
          ) = 0
      `).all(userId);

      if (missedHabits.length === 0) continue;

      // Dedup: only one missed post per user per day
      const alreadyPosted = db.prepare(`
        SELECT 1 FROM posts WHERE user_id = ? AND type = 'missed_habit'
          AND date(created_at) = date('now')
      `).get(userId);
      if (alreadyPosted) continue;

      const names = missedHabits.map(h => h.name).join(', ');
      const content = missedHabits.length === 1
        ? `Missed "${names}" yesterday. Accountability is real.`
        : `Missed ${missedHabits.length} habits yesterday (${names}). Back at it today.`;

      db.prepare(
        "INSERT INTO posts (id, user_id, content, type) VALUES (?, ?, ?, 'missed_habit')"
      ).run(uuidv4(), userId, content);
      posted++;
    }
  }

  console.log(`[Cron] missed-habit-auto-post: created ${posted} posts`);
  return posted;
}

module.exports = { runBuddyAccountabilityReminders, runMissedHabitAutoPost };
