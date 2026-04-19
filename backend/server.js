require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize DB on startup
require('./database/db').getDb();

// Routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/habits', require('./routes/habits'));
app.use('/api/users', require('./routes/users'));
app.use('/api/clubs', require('./routes/challenges'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/dm', require('./routes/dm'));
app.use('/api/events', require('./routes/events'));
app.use('/api/buddies', require('./routes/buddies'));
app.use('/api/recap', require('./routes/recap'));

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'Dialed' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🔥 Dialed API running on http://localhost:${PORT}\n`);
});
