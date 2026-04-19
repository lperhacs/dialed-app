const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'dialed.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    // Run schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);

    // Migrations
    const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!cols.includes('featured_habit_id')) {
      db.exec('ALTER TABLE users ADD COLUMN featured_habit_id TEXT DEFAULT NULL');
    }

    const chCols = db.prepare("PRAGMA table_info(challenges)").all().map(c => c.name);
    if (!chCols.includes('visibility')) {
      db.exec("ALTER TABLE challenges ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'");
    }

    const cmCols = db.prepare("PRAGMA table_info(challenge_members)").all().map(c => c.name);
    if (!cmCols.includes('status')) {
      db.exec("ALTER TABLE challenge_members ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
    }

    // Habit reminder
    const habitCols = db.prepare("PRAGMA table_info(habits)").all().map(c => c.name);
    if (!habitCols.includes('reminder_time')) {
      db.exec("ALTER TABLE habits ADD COLUMN reminder_time TEXT DEFAULT NULL");
    }

    // Settings-related columns
    if (!cols.includes('location')) {
      db.exec("ALTER TABLE users ADD COLUMN location TEXT DEFAULT NULL");
    }
    if (!cols.includes('default_habit_visibility')) {
      db.exec("ALTER TABLE users ADD COLUMN default_habit_visibility TEXT NOT NULL DEFAULT 'public'");
    }
    if (!cols.includes('is_deactivated')) {
      db.exec("ALTER TABLE users ADD COLUMN is_deactivated INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.includes('phone')) {
      db.exec("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT NULL");
    }

    // Badge habit linkage + pinning
    const badgeCols = db.prepare("PRAGMA table_info(badges)").all().map(c => c.name);
    if (!badgeCols.includes('habit_id')) {
      db.exec("ALTER TABLE badges ADD COLUMN habit_id TEXT DEFAULT NULL");
    }
    if (!badgeCols.includes('pinned')) {
      db.exec("ALTER TABLE badges ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
    }

    // Post badge pin
    const postCols = db.prepare("PRAGMA table_info(posts)").all().map(c => c.name);
    if (!postCols.includes('badge_id')) {
      db.exec("ALTER TABLE posts ADD COLUMN badge_id TEXT DEFAULT NULL");
    }

    // Group DM support
    const convCols = db.prepare("PRAGMA table_info(conversations)").all().map(c => c.name);
    if (!convCols.includes('name')) {
      db.exec("ALTER TABLE conversations ADD COLUMN name TEXT DEFAULT NULL");
    }
    if (!convCols.includes('is_group')) {
      db.exec("ALTER TABLE conversations ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0");
    }

    // DM event/club sharing columns
    const dmCols = db.prepare("PRAGMA table_info(direct_messages)").all().map(c => c.name);
    if (!dmCols.includes('event_id')) {
      db.exec("ALTER TABLE direct_messages ADD COLUMN event_id TEXT DEFAULT NULL");
    }
    if (!dmCols.includes('club_id')) {
      db.exec("ALTER TABLE direct_messages ADD COLUMN club_id TEXT DEFAULT NULL");
    }

    // Notifications reference_id column
    const notifCols = db.prepare("PRAGMA table_info(notifications)").all().map(c => c.name);
    if (!notifCols.includes('reference_id')) {
      db.exec("ALTER TABLE notifications ADD COLUMN reference_id TEXT DEFAULT NULL");
    }

    // RSVP privacy
    const colsNow = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!colsNow.includes('rsvp_private')) {
      db.exec("ALTER TABLE users ADD COLUMN rsvp_private INTEGER NOT NULL DEFAULT 0");
    }

    // Events columns
    const evCols = db.prepare("PRAGMA table_info(events)").all().map(c => c.name);
    if (!evCols.includes('club_id')) {
      db.exec("ALTER TABLE events ADD COLUMN club_id TEXT DEFAULT NULL REFERENCES challenges(id)");
    }
    if (!evCols.includes('event_time')) {
      db.exec("ALTER TABLE events ADD COLUMN event_time TEXT DEFAULT NULL");
    }

    // Cheers (one-tap encouragement reaction on posts)
    db.exec(`
      CREATE TABLE IF NOT EXISTS cheers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        post_id TEXT NOT NULL REFERENCES posts(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, post_id)
      );
    `);

    // Buddy pairs (mutual accountability)
    db.exec(`
      CREATE TABLE IF NOT EXISTS buddies (
        id TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL REFERENCES users(id),
        recipient_id TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(requester_id, recipient_id)
      );
    `);

    // Events
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        event_date TEXT NOT NULL,
        location TEXT,
        is_public INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS event_attendees (
        event_id TEXT NOT NULL REFERENCES events(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'going',
        PRIMARY KEY (event_id, user_id)
      );
    `);
  }
  return db;
}

module.exports = { getDb };
