require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
// Railway (and most PaaS) sits behind a proxy that sets X-Forwarded-For.
// Without this, express-rate-limit throws a ValidationError and blocks all
// rate-limited routes (including /auth/forgot-password).
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// ── CORS ─────────────────────────────────────────────────────────────────────
// In development: allow localhost and Expo tunnels.
// In production: set ALLOWED_ORIGINS in your .env (comma-separated).
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
  /^https?:\/\/.*\.ngrok\.io$/,
  /^https?:\/\/.*\.exp\.direct$/,
];
const PROD_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];
const allowedOrigins = process.env.NODE_ENV === 'production' ? PROD_ORIGINS : DEV_ORIGINS;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const { rateLimit } = require('express-rate-limit');
const { writeLimiter, dmLimiter, registerLimiter, writeOnly } = require('./middleware/rateLimits');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests, please try again later.' },
});

const proAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts.' },
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Serve uploads from the same directory the upload middleware writes to
// (persistent volume in prod, local backend/uploads in dev).
const { UPLOAD_DIR } = require('./middleware/upload');
app.use('/uploads', express.static(UPLOAD_DIR));

// Security headers — helmet sets sensible defaults (X-Content-Type-Options,
// X-Frame-Options, HSTS, Referrer-Policy, etc.). CSP disabled because this is
// an API server consumed by a native mobile client, not a browser.
app.use(helmet({ contentSecurityPolicy: false }));

// Initialize DB on startup
require('./database/db').getDb();

// Routes
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/send-otp', otpLimiter);
app.use('/api/auth',          authLimiter,              require('./routes/auth'));
app.use('/api/posts',         writeOnly(writeLimiter),  require('./routes/posts'));
app.use('/api/habits',        writeOnly(writeLimiter),  require('./routes/habits'));
app.use('/api/users',         writeOnly(writeLimiter),  require('./routes/users'));
app.use('/api/clubs',         writeOnly(writeLimiter),  require('./routes/challenges'));
app.use('/api/notifications', writeOnly(writeLimiter),  require('./routes/notifications'));
app.use('/api/leaderboard',                             require('./routes/leaderboard'));
app.use('/api/dm',            writeOnly(dmLimiter),     require('./routes/dm'));
app.use('/api/events',        writeOnly(writeLimiter),  require('./routes/events'));
app.use('/api/buddies',       writeOnly(writeLimiter),  require('./routes/buddies'));
app.use('/api/recap',                                   require('./routes/recap'));
app.use('/api/cron',                                    require('./routes/cron'));
app.use('/api/analytics',                               require('./routes/analytics'));
app.use('/api/waitlist',                                require('./routes/waitlist'));
app.use('/api/pro',           proAdminLimiter,          require('./routes/pro'));

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'Dialed' }));

// Global error handler — never leak internal details in production
app.use((err, _req, res, _next) => {
  console.error(err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd && !err.status ? 'Internal server error' : (err.message || 'Internal server error'),
  });
});

app.listen(PORT, () => {
  console.log(`\n🔥 Dialed API running on http://localhost:${PORT}\n`);

  // Schedule monthly habit reminders.
  // Runs daily at 09:00 UTC — the dedup logic in runMonthlyHabitReminders
  // ensures each user gets at most one push per habit per calendar month.
  const cron = require('node-cron');
  const { runMonthlyHabitReminders } = require('./cron/habitReminders');
  const { runDailyHabitReminders } = require('./cron/dailyHabitReminders');
  const { runChallengeStartReminders } = require('./cron/challengeReminders');
  const { runDbBackup } = require('./cron/dbBackup');
  const { runBuddyAccountabilityReminders, runMissedHabitAutoPost } = require('./cron/buddyReminders');
  const { runWeeklyRecap } = require('./cron/weeklyRecap');
  const { runJointStreakAtRisk } = require('./cron/jointStreakAtRisk');

  // Daily habit reminders — runs hourly. The reminder logic itself decides
  // per-user whether to send a "morning" (9am local) or "evening" (7pm local)
  // push based on each user's `users.timezone`. This replaces the previous
  // fixed 09:00/19:00 UTC schedule that fired in the middle of the night for
  // Pacific users.
  cron.schedule('0 * * * *', () => {
    runDailyHabitReminders().catch(err =>
      console.error('[Cron] daily-habit-reminders failed:', err)
    );
  }, { timezone: 'UTC' });
  console.log('[Cron] daily habit reminder scheduler started (hourly, fires at 9am/7pm local per user)');

  // Challenge start reminder — 10:00 UTC, fires day before a challenge begins
  cron.schedule('0 10 * * *', () => {
    runChallengeStartReminders().catch(err =>
      console.error('[Cron] challenge-start-reminders failed:', err)
    );
  }, { timezone: 'UTC' });
  console.log('[Cron] challenge start reminder scheduler started (10:00 UTC)');

  // Monthly catch-up reminder — runs at 09:00 UTC
  // Nudges users who haven't hit their monthly habit target
  cron.schedule('0 9 * * *', () => {
    runMonthlyHabitReminders().catch(err =>
      console.error('[Cron] monthly-habit-reminders failed:', err)
    );
  }, { timezone: 'UTC' });
  console.log('[Cron] monthly habit reminder scheduler started (09:00 UTC)');

  // Daily DB backup at 03:00 UTC — keeps 7 rolling snapshots
  cron.schedule('0 3 * * *', () => {
    runDbBackup();
  }, { timezone: 'UTC' });
  console.log('[Cron] daily DB backup scheduler started (03:00 UTC, 7-day rolling)');

  // Buddy accountability — runs every hour, fires for users where it's currently 5pm local time
  cron.schedule('0 * * * *', () => {
    runBuddyAccountabilityReminders().catch(err =>
      console.error('[Cron] buddy-accountability-reminders failed:', err)
    );
  }, { timezone: 'UTC' });
  console.log('[Cron] buddy accountability reminder scheduler started (hourly, fires at 5pm local)');

  // Missed habit auto-posts — runs at 00:30 UTC for users who opted in
  cron.schedule('30 0 * * *', () => {
    runMissedHabitAutoPost().catch(err =>
      console.error('[Cron] missed-habit-auto-post failed:', err)
    );
  }, { timezone: 'UTC' });
  console.log('[Cron] missed-habit auto-post scheduler started (00:30 UTC)');

  // Weekly recap — runs hourly, fires for users where it's currently Sunday
  // 9am local. Per-user dedup via reference_id = ISO week token.
  cron.schedule('0 * * * *', () => {
    runWeeklyRecap().catch(err =>
      console.error('[Cron] weekly-recap failed:', err)
    );
  }, { timezone: 'UTC' });
  console.log('[Cron] weekly recap scheduler started (hourly, fires at 9am Sunday local)');

  // Joint streak at-risk — hourly, fires at 8pm local for users whose joint
  // streak is alive but today isn't yet a joint day.
  cron.schedule('0 * * * *', () => {
    runJointStreakAtRisk().catch(err =>
      console.error('[Cron] joint-streak-at-risk failed:', err)
    );
  }, { timezone: 'UTC' });
  console.log('[Cron] joint streak at-risk scheduler started (hourly, fires at 8pm local)\n');
});
