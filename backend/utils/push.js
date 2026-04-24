/**
 * Expo Push Notification helper.
 *
 * Usage:
 *   const { sendPush } = require('./push');
 *   sendPush(recipientUserId, { title, body, data }, prefKey);
 *
 * prefKey maps to a key in the user's notify_prefs JSON column.
 * If the user has that key set to false the push is silently skipped.
 * If the user has no push_token the push is silently skipped.
 * All errors are swallowed — push failures must never crash the request.
 */

const { getDb } = require('../database/db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * @param {string} userId        - recipient's user id
 * @param {{ title: string, body: string, data?: object }} payload
 * @param {string} [prefKey]     - key in notify_prefs to check (e.g. 'cheers')
 */
async function sendPush(userId, payload, prefKey) {
  try {
    const db = getDb();
    const row = db.prepare('SELECT push_token, notify_prefs FROM users WHERE id = ?').get(userId);
    if (!row?.push_token) return;

    // Check user preference if a key was given
    if (prefKey && row.notify_prefs) {
      try {
        const prefs = JSON.parse(row.notify_prefs);
        if (prefs[prefKey] === false) return;
      } catch {
        // malformed prefs — send anyway
      }
    }

    const message = {
      to: row.push_token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: 'default',
    };

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch {
    // Never let push failures surface to the caller
  }
}

module.exports = { sendPush };
