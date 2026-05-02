'use strict';
const fs = require('fs');
const path = require('path');
const { getDb } = require('../database/db');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'dialed.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const MAX_BACKUPS = 7; // keep 7 daily snapshots
const BACKUP_FILE_RE = /^dialed-\d{4}-\d{2}-\d{2}\.db$/;

/**
 * Snapshots the live SQLite DB to backups/dialed-YYYY-MM-DD.db using
 * SQLite's VACUUM INTO, which produces a single self-contained file
 * that's safe to take while the engine is in WAL mode (no torn pages,
 * no separate -wal/-shm needed for restore).
 * Prunes snapshots older than MAX_BACKUPS days.
 */
function runDbBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dest = path.join(BACKUP_DIR, `dialed-${date}.db`);

    // VACUUM INTO fails if the target already exists — remove a same-day
    // snapshot first so re-running the job in the same day still works.
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }

    const db = getDb();
    db.prepare('VACUUM INTO ?').run(dest);
    console.log(`[Backup] DB snapshot saved: ${dest}`);

    // Prune old backups — keep only the most recent MAX_BACKUPS files.
    // Anchored regex so unrelated files matching the prefix don't shift
    // the boundary of what gets pruned.
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => BACKUP_FILE_RE.test(f))
      .sort() // lexicographic = chronological for YYYY-MM-DD names
      .reverse();

    const toDelete = files.slice(MAX_BACKUPS);
    for (const f of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`[Backup] Pruned old snapshot: ${f}`);
    }

    return { ok: true, snapshot: dest };
  } catch (err) {
    console.error('[Backup] DB backup failed:', err);
    return { ok: false, error: err.message };
  }
}

module.exports = { runDbBackup };
