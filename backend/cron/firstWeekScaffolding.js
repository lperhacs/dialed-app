'use strict';
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { getPeriodKeyTz } = require('../utils/streaks');
const { sendPush } = require('../utils/push');

const DEFAULT_TZ = 'America/New_York';
const NUDGE_HOUR = 12;       // noon local — distinct from the 9am/7pm habit reminders
const INSURANCE_HOUR = 11;   // late-morning local — yesterday has settled, bridge it now
const FREEZE_NOTE = '[freeze]';

/**
 * Compute the local hour (0-23) for a tz, UTC fallback on bad tz.
 */
function getLocalHour(now, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz });
    const parsed = parseInt(fmt.format(now), 10);
    return Number.isNaN(parsed) ? now.getUTCHours() : parsed % 24;
  } catch {
    return now.getUTCHours();
  }
}

/**
 * Parse a SQLite datetime ("YYYY-MM-DD HH:MM:SS", naive UTC) into a real Date.
 * SQLite strings have no 'Z', so force UTC before constructing the Date.
 */
function parseSqliteUtc(s) {
  const str = String(s || '');
  const iso = str.includes('T') ? str : str.replace(' ', 'T');
  return new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z');
}

/**
 * First-week retention scaffolding (value #4: the first 3 days decide retention).
 * Runs hourly. Two independent behaviors, each gated on the user's local hour:
 *
 *  1. Day 1/2/3 nudge sequence — at noon local, if a brand-new user has an
 *     active daily habit they haven't logged today, send an encouraging,
 *     day-specific push. Deduped per user-local day.
 *
 *  2. First-miss streak insurance — at 11am local, for a user still in week one
 *     who had a streak going (logged the day before yesterday) but missed
 *     yesterday, auto-insert a single `[freeze]` bridge log for yesterday so the
 *     streak survives. Granted ONCE per user (tracked by a 'streak_insurance'
 *     notification row). The freeze bridges the gap but doesn't count as a streak
 *     day, matching the existing freeze semantics.
 */
async function runFirstWeekScaffolding() {
  const db = getDb();
  const now = new Date();

  const users = db.prepare(`
    SELECT id, push_token, notify_prefs, timezone, created_at
    FROM users
    WHERE push_token IS NOT NULL
  `).all();

  let nudged = 0;
  let insured = 0;

  for (const user of users) {
    const tz = user.timezone || DEFAULT_TZ;
    const localHour = getLocalHour(now, tz);
    if (localHour !== NUDGE_HOUR && localHour !== INSURANCE_HOUR) continue;

    // Account age in whole days (UTC-correct parse of the naive SQLite string).
    const created = parseSqliteUtc(user.created_at);
    const ageDays = (now - created) / (1000 * 60 * 60 * 24);
    const dayNumber = Math.floor(ageDays) + 1; // Day 1 = first calendar day

    // ── 1. Day 1/2/3 nudge ──────────────────────────────────────────────────
    if (localHour === NUDGE_HOUR && dayNumber >= 1 && dayNumber <= 3) {
      // Respect the reminders preference
      let remindersOn = true;
      if (user.notify_prefs) {
        try {
          const prefs = JSON.parse(user.notify_prefs);
          if (prefs.reminders === false) remindersOn = false;
        } catch { /* malformed — send anyway */ }
      }

      if (remindersOn) {
        const todayKey = getPeriodKeyTz(now, 'daily', tz);

        // Only nudge users who have an active daily habit they haven't logged
        // today — otherwise the message has no action behind it.
        const unlogged = db.prepare(`
          SELECT h.id FROM habits h
          WHERE h.user_id = ? AND h.is_active = 1 AND h.frequency = 'daily'
            AND (SELECT COUNT(*) FROM habit_logs
                 WHERE habit_id = h.id AND strftime('%Y-%m-%d', logged_at) = ?
                   AND (note IS NULL OR note NOT IN ('[freeze]', '[restore]'))) = 0
          LIMIT 1
        `).get(user.id, todayKey);

        if (unlogged) {
          const dedupRef = `${user.id}:${todayKey}`;
          const already = db.prepare(`
            SELECT 1 FROM notifications
            WHERE user_id = ? AND type = 'first_week_nudge' AND reference_id = ?
          `).get(user.id, dedupRef);

          if (!already) {
            const copy = {
              1: { title: 'Welcome to Dialed', body: 'Log your first habit today to start your streak.' },
              2: { title: 'Day 2 — keep it going', body: 'Log today and you’re building real momentum.' },
              3: { title: 'Day 3 is where streaks stick', body: 'Log today to lock the habit in — this is the day that matters.' },
            }[dayNumber];

            try {
              db.prepare(
                "INSERT INTO notifications (id, user_id, type, reference_id, message) VALUES (?, ?, 'first_week_nudge', ?, ?)"
              ).run(uuidv4(), user.id, dedupRef, copy.body);
              await sendPush(user.id, {
                title: copy.title, body: copy.body,
                data: { type: 'first_week_nudge', day: dayNumber },
              }, 'reminders');
              nudged++;
            } catch (err) {
              console.warn('[first-week] nudge failed for user', user.id, ':', err.message);
            }
          }
        }
      }
    }

    // ── 2. First-miss streak insurance ──────────────────────────────────────
    if (localHour === INSURANCE_HOUR && ageDays <= 7) {
      // One free pass per user, ever.
      const alreadyInsured = db.prepare(`
        SELECT 1 FROM notifications WHERE user_id = ? AND type = 'streak_insurance'
      `).get(user.id);
      if (alreadyInsured) continue;

      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const dayBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const yesterdayKey = getPeriodKeyTz(yesterday, 'daily', tz);
      const dayBeforeKey = getPeriodKeyTz(dayBefore, 'daily', tz);

      const habits = db.prepare(
        "SELECT id, name FROM habits WHERE user_id = ? AND is_active = 1 AND frequency = 'daily'"
      ).all(user.id);

      for (const habit of habits) {
        const recent = db.prepare(`
          SELECT logged_at, note FROM habit_logs
          WHERE habit_id = ? AND logged_at >= date('now', '-4 days')
        `).all(habit.id);

        const real = recent.filter(l => l.note === null || (l.note !== '[freeze]' && l.note !== '[restore]'));
        const loggedYesterday = real.some(l => getPeriodKeyTz(l.logged_at, 'daily', tz) === yesterdayKey);
        const loggedDayBefore = real.some(l => getPeriodKeyTz(l.logged_at, 'daily', tz) === dayBeforeKey);

        // A streak existed (logged the day before) but yesterday was missed.
        if (loggedDayBefore && !loggedYesterday) {
          // Bridge yesterday with a freeze log at local noon → safely inside the
          // user's yesterday regardless of tz offset.
          const [y, m, d] = yesterdayKey.split('-').map(Number);
          const bridgeAt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
          const body = `We covered your missed day on "${habit.name}" — your streak is safe. First miss is on us.`;

          try {
            db.exec('BEGIN IMMEDIATE');
            db.prepare(
              "INSERT INTO habit_logs (id, habit_id, user_id, note, logged_at) VALUES (?, ?, ?, ?, ?)"
            ).run(uuidv4(), habit.id, user.id, FREEZE_NOTE, bridgeAt);
            db.prepare(
              "INSERT INTO notifications (id, user_id, type, reference_id, message) VALUES (?, ?, 'streak_insurance', ?, ?)"
            ).run(uuidv4(), user.id, habit.id, body);
            db.exec('COMMIT');
          } catch (err) {
            try { db.exec('ROLLBACK'); } catch (_) {}
            console.warn('[first-week] insurance failed for user', user.id, ':', err.message);
            break;
          }

          await sendPush(user.id, {
            title: 'Streak saved', body,
            data: { type: 'streak_insurance', habitId: habit.id },
          }, 'reminders');
          insured++;
          break; // one free pass per user — stop after the first insured habit
        }
      }
    }
  }

  console.log(`[Cron] first-week-scaffolding: ${nudged} nudges, ${insured} streaks insured`);
  return { nudged, insured };
}

module.exports = { runFirstWeekScaffolding };
