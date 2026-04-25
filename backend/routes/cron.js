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

module.exports = router;
