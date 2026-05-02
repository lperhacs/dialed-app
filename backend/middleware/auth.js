const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set');
}
const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    // Verify account is not deactivated
    const db = getDb();
    const account = db.prepare('SELECT is_deactivated, token_version FROM users WHERE id = ?').get(decoded.id);
    if (!account || account.is_deactivated) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }
    // Token version invalidation — older versions (e.g. after password/email change) are rejected.
    // Missing token_version in the JWT is treated as 0 so existing tokens stay valid.
    const tokenVer = decoded.token_version ?? 0;
    const userVer = account.token_version ?? 0;
    if (tokenVer < userVer) {
      return res.status(401).json({ error: 'Token has been invalidated. Please log in again.' });
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
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      const db = getDb();
      const account = db.prepare('SELECT is_deactivated, token_version FROM users WHERE id = ?').get(decoded.id);
      if (account && !account.is_deactivated) {
        const tokenVer = decoded.token_version ?? 0;
        const userVer = account.token_version ?? 0;
        if (tokenVer >= userVer) {
          req.user = decoded;
        }
      }
    } catch {
      // ignore
    }
  }
  next();
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      token_version: user.token_version ?? 0,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { authMiddleware, optionalAuth, generateToken };
