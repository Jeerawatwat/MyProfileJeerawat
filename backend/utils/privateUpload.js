// backend/utils/privateUpload.js
// Storage for money-related evidence files — payment slips, refund evidence,
// expense receipts. Unlike product photos (uploads/, served publicly by
// express.static), these can contain bank account names/numbers, so they live
// in private_uploads/ which is NEVER served statically. The only way to read
// one back is through a route that has already checked the caller may see it,
// and that route calls sendPrivateFile() below.
//
// The database stores only the relative path we generated ourselves
// ("slips/1737...-ab12cd.jpg"), never a client-supplied filename.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const PRIVATE_ROOT = path.join(__dirname, '..', '..', 'private_uploads');

const IMAGE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};
const IMAGE_OR_PDF_TYPES = { ...IMAGE_TYPES, 'application/pdf': '.pdf' };

// folder: 'slips' | 'refunds' | 'expenses'
function createPrivateUpload(folder, { allowPdf = false } = {}) {
  const allowed = allowPdf ? IMAGE_OR_PDF_TYPES : IMAGE_TYPES;
  const dir = path.join(PRIVATE_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      // Extension comes from the (already whitelisted) mimetype, never from
      // the client's filename.
      filename: (req, file, cb) =>
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${allowed[file.mimetype]}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!allowed[file.mimetype]) {
        return cb(new Error(allowPdf ? 'รองรับเฉพาะไฟล์ PNG, JPEG, WEBP หรือ PDF' : 'รองรับเฉพาะไฟล์รูป PNG, JPEG หรือ WEBP'));
      }
      cb(null, true);
    },
  });
}

// Wraps multer's callback API so a route can `await` it and get a clean 400
// with a user-facing message on a bad file (too big / wrong type).
function runUpload(upload, fieldName, req, res) {
  return new Promise((resolve, reject) => {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return resolve(req.file || null);
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ต้องมีขนาดไม่เกิน 5MB' : err.message || 'อัปโหลดไฟล์ไม่สำเร็จ';
      const httpErr = new Error(message);
      httpErr.status = 400;
      httpErr.publicMessage = message;
      reject(httpErr);
    });
  });
}

function relativePathFor(folder, file) {
  return `${folder}/${file.filename}`;
}

// Best-effort cleanup for a file that was saved before the request turned out
// to be invalid (multer writes the file before the route can validate).
function removePrivateFile(relativePath) {
  if (!relativePath) return;
  const full = resolveSafe(relativePath);
  if (full) fs.promises.unlink(full).catch(() => {});
}

function resolveSafe(relativePath) {
  const full = path.resolve(PRIVATE_ROOT, relativePath);
  // Refuse anything that would escape private_uploads/ (defence in depth —
  // paths in the DB are always ones we generated).
  if (!full.startsWith(PRIVATE_ROOT + path.sep)) return null;
  return full;
}

function sendPrivateFile(res, relativePath) {
  const full = relativePath ? resolveSafe(relativePath) : null;
  if (!full || !fs.existsSync(full)) {
    return res.status(404).json({ error: 'ไม่พบไฟล์' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  return res.sendFile(full);
}

module.exports = { createPrivateUpload, runUpload, relativePathFor, removePrivateFile, sendPrivateFile };
