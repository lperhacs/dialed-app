'use strict';
const express = require('express');
const { runMonthlyHabitReminders } = require('../cron/habitReminders');

const router = express.Router();

function requireServerKey(req, res, next) {
  const key = req.headers['x-server-key'];
  if (!key || key !== process.env.SERVER_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

/**
 * POST /api/cron/habit-reminders
 *
 * Trigger monthly habit reminder push notifications.
 * Call this on the 15th and 25th of each month (or any schedule you prefer).
 *
 * Requires header:  X-Server-Key: <SERVER_SECRET>
 *
 * Railway cron example (runs 9am UTC on the 15th and 25th):
 *   Schedule:  0 9 15,25 * *
 *   Command:   curl -s -X POST $RAILWAY_PUBLIC_DOMAIN/api/cron/habit-reminders \
 *                   -H "X-Server-Key: $SERVER_SECRET"
 */
router.post('/habit-reminders', requireServerKey, async (_req, res) => {
  try {
    const sent = await runMonthlyHabitReminders();
    res.json({ ok: true, sent });
  } catch (err) {
    console.error('[Cron] habit-reminders error:', err);
    res.status(500).json({ error: 'Cron job failed' });
  }
});

module.exports = router;
