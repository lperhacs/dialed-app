const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Persist uploads alongside the DB so they survive Railway redeploys.
// In dev (no DB_PATH), falls back to backend/uploads.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'dialed.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(path.dirname(DB_PATH), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Safe extension map — derived from MIME type, never from user-supplied filename
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg':  '.jpg',
  'image/png':  '.png',
  'image/gif':  '.gif',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${require('crypto').randomBytes(16).toString('hex')}`;
    const ext = MIME_EXT[file.mimetype] || '.jpg';
    cb(null, unique + ext);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
