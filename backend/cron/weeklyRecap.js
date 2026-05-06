'use strict';
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { sendPush } = require('../utils/push');
const { buildWeeklyRecap, parseIsoWeek, formatIsoWeek } = require('../utils/recap');

const DEFAULT_TZ = 'America/New_York';
const FIRE_HOUR = 9;          // 9am local
const FIRE_DAY  = 0;          // 0 = Sunday
const MIN_ACCOUNT_AGE_DAYS = 3; // skip brand-new users; recap of 1-2 days is hollow

/**
 * Compute the local day-of-week (0=Sun..6=Sat) and hour (0-23) for a given tz.
 * Falls back to UTC if the tz string is invalid.
 */
function getLocalDayHour(now, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', hour: 'numeric', hour12: false, timeZone: tz,
    });
    const parts = fmt.formatToParts(now);
    const wkMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = wkMap[parts.find(p => p.type === 'weekday')?.value] ?? -1;
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? 'NaN', 10);
    if (weekday < 0 || Number.isNaN(hour)) return { weekday: now.getUTCDay(), hour: now.getUTCHours() };
    return { weekday, hour: hour % 24 };
  } catch {
    return { weekday: now.getUTCDay(), hour: now.getUTCHours() };
  }
}

/**
 * Returns the ISO week token (YYYY-Www) for the week that just ended,
 * given the user's local "now". Sunday 9am local → recap of the week that
 * just ended, which by ISO week convention is the same week as Sunday.
 */
function lastCompletedWeek(now, tz) {
  // Compute the user's local Sunday date by rendering "now" in their tz and
  // formatting as a date. Since we only fire when local weekday=Sunday, that
  // local date IS the last day of the week we want to recap.
  let localDateStr;
  try {
    localDateStr = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz,
    }).format(now);
  } catch {
    localDateStr = now.toISOString().split('T')[0];
  }
  return formatIsoWeek(new Date(`${localDateStr}T12:00:00Z`));
}

/**
 * Hourly cron — for each user where it's currently ~9am Sunday in their tz,
 * build last week's recap and send a push + write a notification row.
 * Dedups via reference_id = ISO week, so re-runs in the same hour are safe.
 *
 * Skips:
 *  - users with no push_token
 *  - users with notify_prefs.weekly_recap === false
 *  - users < 3 days old (recap would be hollow and undermine the format)
 *  - weeks with zero logs (sending a 0-stat recap to a churned user backfires)
 */
async function runWeeklyRecap() {
  const db = getDb();
  const now = new Date();

  const users = db.prepare(`
    SELECT id, push_token, notify_prefs, timezone, created_at
    FROM users
    WHERE push_token IS NOT NULL
  `).all();

  let sent = 0;

  for (const user of users) {
    const tz = user.timezone || DEFAULT_TZ;
    const { weekday, hour } = getLocalDayHour(now, tz);
    if (weekday !== FIRE_DAY || hour !== FIRE_HOUR) continue;

    // Notification preference
    if (user.notify_prefs) {
      try {
        const prefs = JSON.parse(user.notify_prefs);
        if (prefs.weekly_recap === false) continue;
      } catch { /* malformed — send anyway */ }
    }

    // Skip very new accounts — first-week users would get a hollow recap.
    // SQLite's datetime('now') stores naive UTC strings ("YYYY-MM-DD HH:MM:SS")
    // which `new Date()` interprets as LOCAL time on the server, throwing the
    // age calculation off by hours. Force UTC parsing.
    const createdAtRaw = typeof user.created_at === 'string' ? user.created_at : '';
    const createdIso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(createdAtRaw)
      ? createdAtRaw
      : createdAtRaw.replace(' ', 'T') + 'Z';
    const ageDays = (now - new Date(createdIso)) / (1000 * 60 * 60 * 24);
    if (ageDays < MIN_ACCOUNT_AGE_DAYS) continue;

    const week = lastCompletedWeek(now, tz);
    const bounds = parseIsoWeek(week);
    if (!bounds) continue;

    // Dedup: one recap per user per ISO week. reference_id = the week token.
    const already = db.prepare(`
      SELECT 1 FROM notifications WHERE user_id = ? AND type = 'weekly_recap' AND reference_id = ?
    `).get(user.id, week);
    if (already) continue;

    const recap = buildWeeklyRecap(db, user.id, bounds.weekStart, bounds.weekEnd);
    if (recap.total_logs === 0) continue; // no activity → no recap

    const streakLine = recap.streaks_maintained > 0
      ? ` ${recap.streaks_maintained} streak${recap.streaks_maintained === 1 ? '' : 's'} alive.`
      : '';
    const body = `${recap.total_logs} habit${recap.total_logs === 1 ? '' : 's'} logged this week — ${recap.completion_rate}% complete.${streakLine}`;

    db.prepare(`
      INSERT INTO notifications (id, user_id, type, reference_id, message)
      VALUES (?, ?, 'weekly_recap', ?, ?)
    `).run(uuidv4(), user.id, week, body);

    await sendPush(
      user.id,
      { title: 'Your week in review', body, data: { type: 'weekly_recap', week } },
      'weekly_recap'
    );

    sent++;
  }

  console.log(`[Cron] weekly-recap: sent ${sent} recaps`);
  return sent;
}

module.exports = { runWeeklyRecap };
