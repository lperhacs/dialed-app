'use strict';
const { getDb } = require('../database/db');
const { getPeriodKey, getPeriodKeyTz, calculateStreak } = require('../utils/streaks');
const { sendPush } = require('../utils/push');

const DEFAULT_TZ = 'America/New_York';
const MORNING_HOUR = 9;
const EVENING_HOUR = 19;

/**
 * Compute the local hour (0-23) for a given timezone.
 * Falls back to UTC hour if the tz string is invalid.
 */
function getLocalHour(now, tz) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    });
    // en-US with hour12:false can return "24" for midnight on some runtimes;
    // normalize to 0-23.
    const parsed = parseInt(formatter.format(now), 10);
    if (Number.isNaN(parsed)) return now.getUTCHours();
    return parsed % 24;
  } catch {
    return now.getUTCHours();
  }
}

/**
 * Send push reminders to users who haven't logged their daily (and weekly)
 * habits yet for the current period.
 *
 * Called hourly by the cron scheduler. For each habit, computes the owner's
 * local hour from `users.timezone`:
 *   - localHour === 9  → "morning" copy (motivating start-of-day nudge)
 *   - localHour === 19 → "evening" copy (last-chance "don't break it" nudge)
 *   - otherwise        → skip
 *
 * Dedup keys:
 *   - Daily habits: per-user-local YYYY-MM-DD + window
 *   - Weekly habits: per-user-local ISO week (YYYY-Www) + window
 *
 * The dedup key is stored in `notifications.reference_id` along with the
 * habit_id by composing them as "<habitId>:<periodKey>" so we can dedup
 * without a schema change.
 */
async function runDailyHabitReminders() {
  const db = getDb();
  const { v4: uuidv4 } = require('uuid');
  const now = new Date();

  // All active daily + weekly habits with their owner's push token + tz
  const habits = db.prepare(`
    SELECT h.id, h.name, h.user_id, h.frequency, h.target_count,
           u.push_token, u.notify_prefs, u.timezone
    FROM habits h
    JOIN users u ON u.id = h.user_id
    WHERE h.is_active = 1
      AND h.frequency IN ('daily', 'weekly')
      AND u.push_token IS NOT NULL
  `).all();

  let sent = 0;

  for (const habit of habits) {
    const tz = habit.timezone || DEFAULT_TZ;
    const localHour = getLocalHour(now, tz);

    // Only fire at 9am or 7pm local for this user
    let window;
    if (localHour === MORNING_HOUR) window = 'morning';
    else if (localHour === EVENING_HOUR) window = 'evening';
    else continue;

    const notifType = `reminder_${window}`;

    // Check user's reminders preference
    if (habit.notify_prefs) {
      try {
        const prefs = JSON.parse(habit.notify_prefs);
        if (prefs.reminders === false) continue;
      } catch { /* malformed — send anyway */ }
    }

    const target = habit.target_count || 1;

    // Compute the user's local period key — daily uses YYYY-MM-DD, weekly uses
    // the same ISO-week function as streak calculation (getPeriodKeyTz handles
    // both). This keeps the "remind unless completed this period" semantics
    // consistent with the streak code (#25).
    const periodKey = getPeriodKeyTz(now, habit.frequency, tz);

    // How many logs this period? For daily, count logs whose UTC date matches
    // the user's local date. For weekly, we approximate using the same ISO
    // week boundary in UTC — close enough for reminder purposes since logs
    // are stored in UTC and the week boundary differs by at most a few hours.
    let periodCount;
    if (habit.frequency === 'daily') {
      // For daily, compare against the user's local date string. Logs are
      // stored as UTC; we count logs whose own user-local date matches today.
      // Approximation: use the local date directly against logged_at (UTC) —
      // this is what the existing app does and is acceptable for reminders.
      ({ c: periodCount } = db.prepare(`
        SELECT COUNT(*) as c FROM habit_logs
        WHERE habit_id = ? AND strftime('%Y-%m-%d', logged_at) = ?
      `).get(habit.id, periodKey));
    } else {
      // Weekly: count all logs in the user's current ISO week. Pull the last
      // 14 days of logs and bucket them in JS using the same getPeriodKeyTz
      // function so the dedup and the count agree (#7, #25).
      const recent = db.prepare(`
        SELECT logged_at FROM habit_logs
        WHERE habit_id = ? AND logged_at >= date('now', '-21 days')
      `).all(habit.id);
      periodCount = recent.filter(l =>
        getPeriodKeyTz(l.logged_at, 'weekly', tz) === periodKey
      ).length;
    }

    if (periodCount >= target) continue; // already done this period

    // Dedup: one reminder per window per habit per period (day for daily,
    // ISO week for weekly). Encode the period key in reference_id to avoid a
    // schema change.
    const dedupRef = `${habit.id}:${periodKey}`;
    const alreadySent = db.prepare(`
      SELECT 1 FROM notifications
      WHERE user_id = ?
        AND type = ?
        AND reference_id = ?
    `).get(habit.user_id, notifType, dedupRef);

    if (alreadySent) continue;

    // Calculate current streak from the last 90 days of logs
    const recentLogs = db.prepare(`
      SELECT logged_at FROM habit_logs
      WHERE habit_id = ? AND logged_at >= date('now', '-90 days')
      ORDER BY logged_at DESC
    `).all(habit.id);
    const streak = calculateStreak(recentLogs, habit.frequency, target);

    const streakLine = streak > 0
      ? ` You're on a ${streak}-${habit.frequency === 'weekly' ? 'week' : 'day'} streak.`
      : '';

    let title, body;
    if (window === 'morning') {
      title = 'Good morning';
      body = habit.frequency === 'daily'
        ? `Log "${habit.name}" today.${streakLine}`
        : `Don't forget "${habit.name}" this week.${streakLine}`;
    } else {
      title = 'Stay Dialed';
      body = habit.frequency === 'daily'
        ? `Log "${habit.name}" before midnight.${streakLine} Don't break it.`
        : `You haven't logged "${habit.name}" yet this week.${streakLine ? streakLine + ' Don\'t break it.' : ''}`;
    }

    // Persist the in-app notification BEFORE the push send. sendPush is
    // network-dependent; if it throws, the dedup record + inbox entry must
    // still exist so we don't blast a duplicate on the next cron tick.
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, reference_id, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), habit.user_id, notifType, dedupRef, body);

    await sendPush(
      habit.user_id,
      { title, body, data: { habitId: habit.id } },
      'reminders'
    );

    sent++;
  }

  console.log(`[Cron] daily-habit-reminders: sent ${sent} reminders`);
  return sent;
}

module.exports = { runDailyHabitReminders };
