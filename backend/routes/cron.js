'use strict';
const express = require('express');
const { runMonthlyHabitReminders } = require('../cron/habitReminders');
const { runDailyHabitReminders } = require('../cron/dailyHabitReminders');
const { runDbBackup } = require('../cron/dbBackup');

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
 * Manually trigger the monthly habit reminder job (admin/testing use).
 * The job also runs automatically every day at 09:00 UTC via node-cron
 * (see server.js). Requires header: X-Server-Key: <SERVER_SECRET>
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

router.post('/daily-reminders', requireServerKey, async (_req, res) => {
  try {
    const sent = await runDailyHabitReminders();
    res.json({ ok: true, sent });
  } catch (err) {
    console.error('[Cron] daily-reminders error:', err);
    res.status(500).json({ error: 'Cron job failed' });
  }
});

// POST /api/cron/db-backup — manually trigger a DB snapshot
router.post('/db-backup', requireServerKey, (req, res) => {
  const result = runDbBackup();
  if (result.ok) {
    res.json({ ok: true, snapshot: result.snapshot });
  } else {
    res.status(500).json({ error: result.error });
  }
});

module.exports = router;
