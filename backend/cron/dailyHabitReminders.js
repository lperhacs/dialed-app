'use strict';
const { getDb } = require('../database/db');
const { getPeriodKey } = require('../utils/streaks');
const { sendPush } = require('../utils/push');

/**
 * Send evening push reminders to users who haven't logged their
 * daily (and weekly) habits yet for the current period.
 *
 * Deduped: at most one reminder per habit per period.
 * Called by the node-cron scheduler in server.js at 19:00 UTC.
 */
async function runDailyHabitReminders() {
  const db = getDb();
  const now = new Date();
  const todayKey   = getPeriodKey(now, 'daily');   // e.g. "2026-04-29"
  const weekKey    = getPeriodKey(now, 'weekly');   // e.g. "2026-W18"

  // All active daily + weekly habits with their owner's push token
  const habits = db.prepare(`
    SELECT h.id, h.name, h.user_id, h.frequency, h.target_count, h.streak,
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

    const periodKey = habit.frequency === 'daily' ? todayKey : weekKey;
    const target = habit.target_count || 1;

    // How many logs this period?
    let periodCount;
    if (habit.frequency === 'daily') {
      ({ c: periodCount } = db.prepare(`
        SELECT COUNT(*) as c FROM habit_logs
        WHERE habit_id = ? AND strftime('%Y-%m-%d', logged_at) = ?
      `).get(habit.id, todayKey));
    } else {
      // Weekly: count logs in the ISO week
      ({ c: periodCount } = db.prepare(`
        SELECT COUNT(*) as c FROM habit_logs
        WHERE habit_id = ?
          AND strftime('%Y-%W', logged_at) = strftime('%Y-%W', 'now')
      `).get(habit.id));
    }

    if (periodCount >= target) continue; // already done

    // Dedup: skip if we already sent a reminder for this habit this period
    const alreadySent = db.prepare(`
      SELECT 1 FROM notifications
      WHERE user_id = ?
        AND type = 'reminder'
        AND message LIKE ?
        AND created_at >= date('now', 'start of day')
    `).get(habit.user_id, `%${habit.name}%`);

    if (alreadySent) continue;

    const streakLine = habit.streak > 0
      ? ` You're on a ${habit.streak}-day streak — don't break it.`
      : '';

    const body = habit.frequency === 'daily'
      ? `Log "${habit.name}" before midnight.${streakLine}`
      : `You haven't logged "${habit.name}" yet this week.${streakLine}`;

    await sendPush(
      habit.user_id,
      { title: 'Stay Dialed', body, data: { habitId: habit.id } },
      'reminders'
    );

    // In-app notification (lightweight — no icon needed, just the nudge)
    const { v4: uuidv4 } = require('uuid');
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, message)
      VALUES (?, ?, 'reminder', ?)
    `).run(uuidv4(), habit.user_id, body);

    sent++;
  }

  console.log(`[Cron] daily-habit-reminders: sent ${sent} reminders`);
  return sent;
}

module.exports = { runDailyHabitReminders };
