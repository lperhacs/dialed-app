const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  console.warn('[AUTH] WARNING: JWT_SECRET not set — using insecure default. Set JWT_SECRET before deploying.');
  return 'dialed_secret_change_in_prod';
})();

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify account is not deactivated
    const db = getDb();
    const account = db.prepare('SELECT is_deactivated FROM users WHERE id = ?').get(decoded.id);
    if (!account || account.is_deactivated) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const db = getDb();
      const account = db.prepare('SELECT is_deactivated FROM users WHERE id = ?').get(decoded.id);
      if (account && !account.is_deactivated) {
        req.user = decoded;
      }
    } catch {
      // ignore
    }
  }
  next();
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { authMiddleware, optionalAuth, generateToken };
