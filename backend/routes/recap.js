const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { parseIsoWeek, currentIsoWeekBounds, buildWeeklyRecap } = require('../utils/recap');

const router = express.Router();

// GET /api/recap/weekly?week=YYYY-Www  (week optional; defaults to current week)
router.get('/weekly', authMiddleware, (req, res) => {
  const db = getDb();
  let bounds;
  if (req.query.week) {
    bounds = parseIsoWeek(String(req.query.week));
    if (!bounds) return res.status(400).json({ error: 'Invalid week format (expected YYYY-Www)' });
  } else {
    bounds = currentIsoWeekBounds();
  }
  try {
    const recap = buildWeeklyRecap(db, req.user.id, bounds.weekStart, bounds.weekEnd);
    res.json(recap);
  } catch (err) {
    console.error('[Recap] failed:', err);
    res.status(500).json({ error: 'Could not generate recap.' });
  }
});

module.exports = router;
