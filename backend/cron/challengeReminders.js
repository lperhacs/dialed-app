'use strict';
const { getDb } = require('../database/db');
const { sendPush } = require('../utils/push');

/**
 * Push reminders for challenges starting tomorrow.
 * Runs daily at 10:00 UTC — gives members a heads-up the day before.
 * Deduped: checks notifications table to avoid double-sending.
 */
async function runChallengeStartReminders() {
  const db = getDb();

  // Challenges whose start_date is tomorrow
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

  const challenges = db.prepare(`
    SELECT id, name FROM challenges
    WHERE start_date = ? AND is_active = 1
  `).all(tomorrowStr);

  let sent = 0;

  for (const challenge of challenges) {
    const members = db.prepare(`
      SELECT user_id FROM challenge_members
      WHERE challenge_id = ? AND status = 'active'
    `).all(challenge.id);

    for (const { user_id } of members) {
      // Dedup: skip if already sent for this challenge
      const alreadySent = db.prepare(`
        SELECT 1 FROM notifications
        WHERE user_id = ? AND type = 'reminder' AND challenge_id = ?
          AND created_at >= date('now', '-1 day')
      `).get(user_id, challenge.id);
      if (alreadySent) continue;

      await sendPush(user_id, {
        title: 'Challenge starts tomorrow',
        body: `"${challenge.name}" kicks off tomorrow. Get ready.`,
        data: { type: 'challenge_start', challengeId: challenge.id },
      }, 'challenges');

      const { v4: uuidv4 } = require('uuid');
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, challenge_id, message)
        VALUES (?, ?, 'reminder', ?, ?)
      `).run(uuidv4(), user_id, challenge.id, `"${challenge.name}" starts tomorrow`);

      sent++;
    }
  }

  console.log(`[Cron] challenge-start-reminders: sent ${sent} reminders`);
  return sent;
}

module.exports = { runChallengeStartReminders };
