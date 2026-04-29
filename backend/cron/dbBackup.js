'use strict';
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'dialed.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const MAX_BACKUPS = 7; // keep 7 daily snapshots

/**
 * Copies dialed.db to backups/dialed-YYYY-MM-DD.db
 * Prunes snapshots older than MAX_BACKUPS days.
 * Safe to call while the app is running — copies the file at the OS level.
 */
function runDbBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dest = path.join(BACKUP_DIR, `dialed-${date}.db`);

    fs.copyFileSync(DB_PATH, dest);
    console.log(`[Backup] DB snapshot saved: ${dest}`);

    // Prune old backups — keep only the most recent MAX_BACKUPS files
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('dialed-') && f.endsWith('.db'))
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
