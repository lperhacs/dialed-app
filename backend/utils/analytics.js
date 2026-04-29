const { v4: uuidv4 } = require('uuid');

let _db = null;
function getDb() {
  if (!_db) _db = require('../database/db').getDb();
  return _db;
}

/**
 * Fire-and-forget event tracker. Never throws — analytics must never break the app.
 *
 * @param {string|null} userId
 * @param {string} eventName
 * @param {object} properties  — no PII (no email, phone, password). safe fields only.
 * @param {object} meta        — { platform, app_version } from request headers
 */
function trackEvent(userId, eventName, properties = {}, meta = {}) {
  try {
    const db = getDb();
    db.prepare(
      'INSERT INTO analytics_events (id, user_id, event_name, properties, platform, app_version) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      uuidv4(),
      userId || null,
      eventName,
      JSON.stringify(properties),
      meta.platform || null,
      meta.app_version || null
    );
  } catch (_) {
    // silently swallow — analytics must never crash the request
  }
}

/**
 * Extract platform/app_version from standard request headers.
 * Mobile sends:  x-platform: ios|android   x-app-version: 1.2.3
 */
function metaFromReq(req) {
  return {
    platform: req.headers['x-platform'] || null,
    app_version: req.headers['x-app-version'] || null,
  };
}

module.exports = { trackEvent, metaFromReq };
