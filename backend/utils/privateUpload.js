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
// Claim evidence can be a short video of the fault (e.g. Bluetooth not
// pairing) — the spec explicitly asks for "รูปภาพหรือวิดีโอหลักฐาน".
const VIDEO_TYPES = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};
const IMAGE_OR_VIDEO_TYPES = { ...IMAGE_TYPES, ...VIDEO_TYPES };

// folder: 'slips' | 'refunds' | 'expenses' | 'claims'
function createPrivateUpload(folder, { allowPdf = false, allowVideo = false, maxSizeMb = 5 } = {}) {
  const allowed = allowVideo ? IMAGE_OR_VIDEO_TYPES : allowPdf ? IMAGE_OR_PDF_TYPES : IMAGE_TYPES;
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
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!allowed[file.mimetype]) {
        const message = allowVideo
          ? 'รองรับเฉพาะไฟล์รูป PNG, JPEG, WEBP หรือวิดีโอ MP4, WEBM, MOV'
          : allowPdf
            ? 'รองรับเฉพาะไฟล์ PNG, JPEG, WEBP หรือ PDF'
            : 'รองรับเฉพาะไฟล์รูป PNG, JPEG หรือ WEBP';
        return cb(new Error(message));
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

// Wraps multer's callback API for multiple files under one field (claim
// evidence, inspection-result photos) — same clean-400-on-bad-file behaviour
// as runUpload above, just returning req.files instead of a single req.file.
function runUploadMultiple(upload, fieldName, maxCount, req, res) {
  return new Promise((resolve, reject) => {
    upload.array(fieldName, maxCount)(req, res, (err) => {
      if (!err) return resolve(req.files || []);
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'ไฟล์ต้องมีขนาดไม่เกินที่กำหนด'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `แนบไฟล์ได้ไม่เกิน ${maxCount} ไฟล์`
            : err.message || 'อัปโหลดไฟล์ไม่สำเร็จ';
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

function removePrivateFiles(relativePaths) {
  (relativePaths || []).forEach(removePrivateFile);
}

function resolveSafe(relativePath) {
  const full = path.resolve(PRIVATE_ROOT, relativePath);
  // Refuse anything that would escape private_uploads/ (defence in depth —
  // paths in the DB are always ones we generated).
  if (!full.startsWith(PRIVATE_ROOT + path.sep)) return null;
  return full;
}

// Exposes the same safe path resolution sendPrivateFile() uses, for callers
// that need the real filesystem path directly (e.g. embedding an evidence
// image into a PDF with pdfkit) rather than streaming it as the response.
function absolutePathFor(relativePath) {
  return relativePath ? resolveSafe(relativePath) : null;
}

function sendPrivateFile(res, relativePath) {
  const full = relativePath ? resolveSafe(relativePath) : null;
  if (!full || !fs.existsSync(full)) {
    return res.status(404).json({ error: 'ไม่พบไฟล์' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  return res.sendFile(full);
}

module.exports = {
  createPrivateUpload,
  runUpload,
  runUploadMultiple,
  relativePathFor,
  removePrivateFile,
  removePrivateFiles,
  sendPrivateFile,
  absolutePathFor,
};
