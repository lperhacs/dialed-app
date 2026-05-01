'use strict';
const { getDb } = require('../database/db');
const { getPeriodKey, calculateStreak } = require('../utils/streaks');
const { sendPush } = require('../utils/push');

/**
 * Send push reminders to users who haven't logged their daily (and weekly)
 * habits yet for the current period.
 *
 * @param {'morning'|'evening'} window - Controls message tone and dedup key.
 *   morning  → 09:00 UTC — motivating "start your day" nudge
 *   evening  → 19:00 UTC — "don't break your streak" last-chance nudge
 *
 * Each window has its own notification type (reminder_morning / reminder_evening)
 * so both can fire in the same day without blocking each other.
 */
async function runDailyHabitReminders(window = 'evening') {
  const db = getDb();
  const { v4: uuidv4 } = require('uuid');
  const notifType = `reminder_${window}`;
  const now = new Date();
  const todayKey = getPeriodKey(now, 'daily');   // e.g. "2026-04-29"

  // All active daily + weekly habits with their owner's push token
  const habits = db.prepare(`
    SELECT h.id, h.name, h.user_id, h.frequency, h.target_count,
           u.push_token, u.notify_prefs
    FROM habits h
    JOIN users u ON u.id = h.user_id
    WHERE h.is_active = 1
      AND h.frequency IN ('daily', 'weekly')
      AND u.push_token IS NOT NULL
  `).all();

  let sent = 0;

  for (const habit of habits) {
    // Check user's reminders preference
    if (habit.notify_prefs) {
      try {
        const prefs = JSON.parse(habit.notify_prefs);
        if (prefs.reminders === false) continue;
      } catch { /* malformed — send anyway */ }
    }

    const target = habit.target_count || 1;

    // How many logs this period?
    let periodCount;
    if (habit.frequency === 'daily') {
      ({ c: periodCount } = db.prepare(`
        SELECT COUNT(*) as c FROM habit_logs
        WHERE habit_id = ? AND strftime('%Y-%m-%d', logged_at) = ?
      `).get(habit.id, todayKey));
    } else {
      // Weekly: count logs in the current ISO week
      ({ c: periodCount } = db.prepare(`
        SELECT COUNT(*) as c FROM habit_logs
        WHERE habit_id = ?
          AND strftime('%Y-%W', logged_at) = strftime('%Y-%W', 'now')
      `).get(habit.id));
    }

    if (periodCount >= target) continue; // already done

    // Dedup: one reminder per window per habit per calendar day
    const alreadySent = db.prepare(`
      SELECT 1 FROM notifications
      WHERE user_id = ?
        AND type = ?
        AND reference_id = ?
        AND created_at >= date('now', 'start of day')
    `).get(habit.user_id, notifType, habit.id);

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

    await sendPush(
      habit.user_id,
      { title, body, data: { habitId: habit.id } },
      'reminders'
    );

    db.prepare(`
      INSERT INTO notifications (id, user_id, type, reference_id, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), habit.user_id, notifType, habit.id, body);

    sent++;
  }

  console.log(`[Cron] daily-habit-reminders (${window}): sent ${sent} reminders`);
  return sent;
}

module.exports = { runDailyHabitReminders };
