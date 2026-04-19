/**
 * Streak & badge utilities for Dialed
 */

// Parse a date value as UTC. SQLite datetime('now') returns strings like
// "2026-04-08 02:30:00" (no timezone marker) which JS would otherwise
// interpret as local time — causing wrong period keys on non-UTC machines.
function toUtcDate(date) {
  if (date instanceof Date) return date;
  if (typeof date === 'string') {
    const iso = date.includes('T') ? date : date.replace(' ', 'T');
    return new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  }
  return new Date(date);
}

function getPeriodKey(date, frequency) {
  const d = toUtcDate(date);
  if (frequency === 'daily') {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  if (frequency === 'weekly') {
    // ISO week
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  if (frequency === 'monthly') {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return '';
}

function prevPeriodDate(date, frequency) {
  const d = toUtcDate(date);
  if (frequency === 'daily') {
    d.setUTCDate(d.getUTCDate() - 1);
  } else if (frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() - 7);
  } else if (frequency === 'monthly') {
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return d;
}

function calculateStreak(logs, frequency) {
  if (!logs || logs.length === 0) return 0;

  const loggedPeriods = new Set(
    logs.map(l => getPeriodKey(l.logged_at, frequency))
  );

  const now = new Date();
  let checkDate = now;
  let streak = 0;

  // If current period not logged, start checking from previous period
  const currentPeriod = getPeriodKey(checkDate, frequency);
  if (!loggedPeriods.has(currentPeriod)) {
    checkDate = prevPeriodDate(checkDate, frequency);
  }

  while (true) {
    const key = getPeriodKey(checkDate, frequency);
    if (loggedPeriods.has(key)) {
      streak++;
      checkDate = prevPeriodDate(checkDate, frequency);
    } else {
      break;
    }
  }

  return streak;
}

function isStreakAtRisk(logs, frequency) {
  if (!logs || logs.length === 0) return false;

  const now = new Date();
  const currentPeriod = getPeriodKey(now, frequency);
  const loggedPeriods = new Set(logs.map(l => getPeriodKey(l.logged_at, frequency)));

  // At risk = has an existing streak BUT hasn't logged this period yet
  if (loggedPeriods.has(currentPeriod)) return false;

  const prevDate = prevPeriodDate(now, frequency);
  const prevPeriod = getPeriodKey(prevDate, frequency);
  return loggedPeriods.has(prevPeriod);
}

function buildStreakCalendar(logs, frequency, days = 365) {
  const loggedPeriods = new Set(
    logs.map(l => getPeriodKey(l.logged_at, frequency))
  );

  const calendar = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = getPeriodKey(d, frequency);
    calendar.push({
      date: key,
      logged: loggedPeriods.has(key),
    });
  }

  return calendar;
}

const BADGE_DEFS = [
  // Daily badges
  { type: 'day_3',            label: 'Ignition',       desc: '3-day streak',        icon: '', freq: 'daily', check: (streak) => streak >= 3 },
  { type: 'day_7',            label: 'Week Warrior',   desc: '7-day streak',        icon: '', freq: 'daily', check: (streak) => streak >= 7 },
  { type: 'day_14',           label: 'Fortnight',      desc: '14-day streak',       icon: '', freq: 'daily', check: (streak) => streak >= 14 },
  { type: 'day_30',           label: 'Iron Will',      desc: '30-day streak',       icon: '', freq: 'daily', check: (streak) => streak >= 30 },
  { type: 'day_60',           label: 'Double Down',    desc: '60-day streak',       icon: '', freq: 'daily', check: (streak) => streak >= 60 },
  { type: 'day_90',           label: 'Relentless',     desc: '90-day streak',       icon: '', freq: 'daily', check: (streak) => streak >= 90 },
  { type: 'day_180',          label: 'Unstoppable',    desc: '180-day streak',      icon: '', freq: 'daily', check: (streak) => streak >= 180 },
  { type: 'day_365',          label: 'Full Circle',    desc: '365-day streak',      icon: '', freq: 'daily', check: (streak) => streak >= 365 },
  { type: 'year_two_daily',   label: 'The Long Game',  desc: '2-year daily streak', icon: '', freq: 'daily', check: (streak) => streak >= 730 },
  { type: 'year_three_daily', label: 'Ironclad',       desc: '3-year daily streak', icon: '', freq: 'daily', check: (streak) => streak >= 1095 },
  { type: 'year_four_daily',  label: 'Legendary',      desc: '4-year daily streak', icon: '', freq: 'daily', check: (streak) => streak >= 1460 },
  { type: 'year_five_daily',  label: 'Hall of Fame',   desc: '5-year daily streak', icon: '', freq: 'daily', check: (streak) => streak >= 1825 },
  // Weekly badges
  { type: 'week_1',   label: 'First Step',     desc: '1-week streak',   icon: '', freq: 'weekly', check: (streak) => streak >= 1 },
  { type: 'week_4',   label: 'Month Strong',   desc: '4-week streak',   icon: '', freq: 'weekly', check: (streak) => streak >= 4 },
  { type: 'week_8',   label: 'Locked In',      desc: '8-week streak',   icon: '', freq: 'weekly', check: (streak) => streak >= 8 },
  { type: 'week_12',  label: 'Quarter Grind',  desc: '12-week streak',  icon: '', freq: 'weekly', check: (streak) => streak >= 12 },
  { type: 'week_24',  label: 'Halfway There',  desc: '24-week streak',  icon: '', freq: 'weekly', check: (streak) => streak >= 24 },
  { type: 'week_52',  label: 'Year Round',     desc: '52-week streak',  icon: '', freq: 'weekly', check: (streak) => streak >= 52 },
  { type: 'week_78',  label: 'No Days Off',    desc: '78-week streak',  icon: '', freq: 'weekly', check: (streak) => streak >= 78 },
  { type: 'week_104', label: 'Two Year Titan', desc: '104-week streak', icon: '', freq: 'weekly', check: (streak) => streak >= 104 },
  // Monthly badges
  { type: 'month_1',  label: 'First Chapter',   desc: '1-month streak',  icon: '', freq: 'monthly', check: (streak) => streak >= 1 },
  { type: 'month_2',  label: 'Building',         desc: '2-month streak',  icon: '', freq: 'monthly', check: (streak) => streak >= 2 },
  { type: 'month_3',  label: 'Quarter Mark',     desc: '3-month streak',  icon: '', freq: 'monthly', check: (streak) => streak >= 3 },
  { type: 'month_6',  label: 'Half Year Hero',   desc: '6-month streak',  icon: '', freq: 'monthly', check: (streak) => streak >= 6 },
  { type: 'month_12', label: 'Year One',          desc: '12-month streak', icon: '', freq: 'monthly', check: (streak) => streak >= 12 },
  { type: 'month_24', label: 'Two Year Club',     desc: '24-month streak', icon: '', freq: 'monthly', check: (streak) => streak >= 24 },
  { type: 'month_36', label: 'Three Year Grind',  desc: '36-month streak', icon: '', freq: 'monthly', check: (streak) => streak >= 36 },
  { type: 'month_48', label: 'Four Year Legend',  desc: '48-month streak', icon: '', freq: 'monthly', check: (streak) => streak >= 48 },
  { type: 'month_60', label: 'Five Year Icon',    desc: '60-month streak', icon: '', freq: 'monthly', check: (streak) => streak >= 60 },
];

function getEarnedBadges(streak, totalLogs, frequency) {
  return BADGE_DEFS.filter(b => {
    if (b.freq && b.freq !== frequency) return false;
    return b.check(streak, totalLogs);
  });
}

module.exports = {
  getPeriodKey,
  calculateStreak,
  isStreakAtRisk,
  buildStreakCalendar,
  getEarnedBadges,
  BADGE_DEFS,
};
