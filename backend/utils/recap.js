const { calculateStreak } = require('./streaks');

// Convert "YYYY-Www" (ISO week) → { weekStart: 'YYYY-MM-DD', weekEnd: 'YYYY-MM-DD' } (Mon–Sun).
// Returns null if the input is malformed.
function parseIsoWeek(token) {
  const m = /^(\d{4})-W(\d{2})$/.exec(token);
  if (!m) return null;
  const year = +m[1];
  const week = +m[2];
  if (week < 1 || week > 53) return null;
  // ISO week: week 1 is the week containing the first Thursday of the year.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1=Mon..7=Sun
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().split('T')[0],
    weekEnd: sunday.toISOString().split('T')[0],
  };
}

// Format a Date as "YYYY-Www".
function formatIsoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO: Thursday in target week determines the year.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Default to the current Mon–Sun week (UTC).
function currentIsoWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().split('T')[0],
    weekEnd: sunday.toISOString().split('T')[0],
  };
}

// Build the recap object for a given user + week. Reused by the route AND the
// weekly recap push cron, so both reads see identical numbers.
function buildWeeklyRecap(db, userId, weekStart, weekEnd) {
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? AND is_active = 1').all(userId);

  const habitSummary = habits.map(h => {
    const logsThisWeek = db.prepare(
      "SELECT COUNT(*) as c FROM habit_logs WHERE habit_id = ? AND date(logged_at) >= ? AND date(logged_at) <= ?"
    ).get(h.id, weekStart, weekEnd).c;

    const allLogs = db.prepare('SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC').all(h.id);
    const streak = calculateStreak(allLogs, h.frequency);
    const expected = h.frequency === 'daily' ? 7 : 1;

    return {
      habit_id: h.id,
      habit_name: h.name,
      habit_color: h.color,
      frequency: h.frequency,
      logs_this_week: logsThisWeek,
      expected_this_week: expected,
      streak,
      completed: logsThisWeek >= 1,
    };
  });

  const total_logs = db.prepare(
    "SELECT COUNT(*) as c FROM habit_logs WHERE user_id = ? AND date(logged_at) >= ? AND date(logged_at) <= ?"
  ).get(userId, weekStart, weekEnd).c;

  const total_cheers = db.prepare(
    `SELECT COUNT(*) as c FROM cheers ch
     JOIN posts p ON p.id = ch.post_id
     WHERE p.user_id = ? AND date(ch.created_at) >= ? AND date(ch.created_at) <= ?`
  ).get(userId, weekStart, weekEnd).c;

  const total_likes = db.prepare(
    `SELECT COUNT(*) as c FROM likes l
     JOIN posts p ON p.id = l.post_id
     WHERE p.user_id = ? AND date(l.created_at) >= ? AND date(l.created_at) <= ?`
  ).get(userId, weekStart, weekEnd).c;

  const streaks_maintained = habitSummary.filter(h => h.streak > 0).length;
  const habits_completed = habitSummary.filter(h => h.completed).length;

  const total_expected = habitSummary.reduce((s, h) => s + h.expected_this_week, 0);
  const completion_rate = total_expected > 0
    ? Math.min(100, Math.round((total_logs / total_expected) * 100))
    : 0;

  return {
    week_start: weekStart,
    week_end: weekEnd,
    habits: habitSummary,
    total_logs,
    total_cheers,
    total_likes,
    streaks_maintained,
    habits_completed,
    habit_count: habits.length,
    completion_rate,
  };
}

module.exports = { parseIsoWeek, formatIsoWeek, currentIsoWeekBounds, buildWeeklyRecap };
