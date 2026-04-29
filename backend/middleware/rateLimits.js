const { rateLimit } = require('express-rate-limit');

// General write operations — 60 per 15 minutes per IP
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// DM message sending — 30 messages per minute per IP
const dmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Sending too fast. Please wait a moment.' },
});

// Analytics admin endpoint — tight limit to prevent key brute force
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
});

// Wrapper: only applies rate limit to non-GET methods so browsing is unaffected
function writeOnly(limiter) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    return limiter(req, res, next);
  };
}

module.exports = { writeLimiter, dmLimiter, analyticsLimiter, writeOnly };
