'use strict';
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { getPeriodKey } = require('../utils/streaks');
const { sendPush } = require('../utils/push');

/**
 * Send push + in-app reminders to users who haven't met their monthly habit
 * target yet this calendar month.
 *
 * Deduped: at most one reminder per habit per calendar month.
 * Called by POST /api/cron/habit-reminders (Railway cron or similar).
 */
async function runMonthlyHabitReminders() {
  const db = getDb();
  const now = new Date();
  const currentPeriod = getPeriodKey(now, 'monthly'); // e.g. "2026-04"

  // All active monthly habits
  const habits = db.prepare(`
    SELECT h.id, h.name, h.user_id, h.target_count
    FROM habits h
    WHERE h.is_active = 1
      AND h.frequency = 'monthly'
  `).all();

  let sent = 0;

  for (const habit of habits) {
    const target = habit.target_count || 1;

    // How many times has this habit been logged in the current calendar month?
    const { c: periodCount } = db.prepare(`
      SELECT COUNT(*) as c
      FROM habit_logs
      WHERE habit_id = ?
        AND strftime('%Y-%m', logged_at) = ?
    `).get(habit.id, currentPeriod);

    if (periodCount >= target) continue; // already done for the month

    // Dedup: only one reminder per habit per calendar month
    const alreadySent = db.prepare(`
      SELECT 1 FROM notifications
      WHERE user_id = ?
        AND type = 'reminder'
        AND message LIKE ?
        AND strftime('%Y-%m', created_at) = ?
    `).get(habit.user_id, `%${habit.name}%`, currentPeriod);

    if (alreadySent) continue;

    const msg = `Don't forget to log "${habit.name}" this month!`;

    // Push (silently skipped if user has no token or has reminders pref off)
    await sendPush(
      habit.user_id,
      { title: 'Stay Dialed', body: msg, data: { habitId: habit.id } },
      'reminders'
    );

    // In-app notification
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, message)
      VALUES (?, ?, 'reminder', ?)
    `).run(uuidv4(), habit.user_id, msg);

    sent++;
  }

  console.log(`[Cron] monthly-habit-reminders: sent ${sent} reminders`);
  return sent;
}

module.exports = { runMonthlyHabitReminders };
