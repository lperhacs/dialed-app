const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'dialed.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Ensure the directory exists (needed when DB_PATH points to a mounted volume)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

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

    // Habit reminder + target count
    const habitCols = db.prepare("PRAGMA table_info(habits)").all().map(c => c.name);
    if (!habitCols.includes('reminder_time')) {
      db.exec("ALTER TABLE habits ADD COLUMN reminder_time TEXT DEFAULT NULL");
    }
    if (!habitCols.includes('target_count')) {
      db.exec("ALTER TABLE habits ADD COLUMN target_count INTEGER NOT NULL DEFAULT 1");
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

    // Buddy visibility
    const colsNow2 = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!colsNow2.includes('buddy_visibility')) {
      db.exec("ALTER TABLE users ADD COLUMN buddy_visibility TEXT NOT NULL DEFAULT 'public'");
    }

    // Push notifications
    if (!colsNow.includes('push_token')) {
      db.exec("ALTER TABLE users ADD COLUMN push_token TEXT DEFAULT NULL");
    }
    if (!colsNow.includes('notify_prefs')) {
      db.exec("ALTER TABLE users ADD COLUMN notify_prefs TEXT DEFAULT NULL");
    }

    // Events columns (only if table already exists — it's created below on fresh DBs)
    const evTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
    if (evTableExists) {
      const evCols = db.prepare("PRAGMA table_info(events)").all().map(c => c.name);
      if (!evCols.includes('club_id')) {
        db.exec("ALTER TABLE events ADD COLUMN club_id TEXT DEFAULT NULL REFERENCES challenges(id)");
      }
      if (!evCols.includes('event_time')) {
        db.exec("ALTER TABLE events ADD COLUMN event_time TEXT DEFAULT NULL");
      }
    }

    // Pro subscription columns
    const proUserCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!proUserCols.includes('is_pro')) {
      db.exec("ALTER TABLE users ADD COLUMN is_pro INTEGER NOT NULL DEFAULT 0");
    }
    if (!proUserCols.includes('pro_expires_at')) {
      db.exec("ALTER TABLE users ADD COLUMN pro_expires_at DATETIME DEFAULT NULL");
    }
    if (!proUserCols.includes('streak_freezes')) {
      db.exec("ALTER TABLE users ADD COLUMN streak_freezes INTEGER NOT NULL DEFAULT 0");
    }

    // Email verification
    const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!userCols.includes('email_verified')) {
      db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verifications(user_id);
    `);

    // Analytics event stream
    db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT NULL,
        event_name TEXT NOT NULL,
        properties TEXT DEFAULT '{}',
        platform TEXT DEFAULT NULL,
        app_version TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events(event_name);
      CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_events(user_id);
    `);

    // Message read tracking
    const cpCols = db.prepare("PRAGMA table_info(conversation_participants)").all().map(c => c.name);
    if (!cpCols.includes('last_read_at')) {
      db.exec("ALTER TABLE conversation_participants ADD COLUMN last_read_at DATETIME DEFAULT NULL");
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
