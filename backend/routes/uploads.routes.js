// backend/routes/uploads.routes.js
// Lets a logged-in admin upload a product photo from their device. The file is
// saved on the server's own disk (never in the database as a blob) and only
// its public path is stored on the product row — same as pasting an external
// image URL, just sourced locally instead. Admin-only: this is only ever used
// from the product add/edit form, which regular "user" accounts never see.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — plenty for a product photo, small enough to stay fast
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPEG, WEBP, or GIF images are allowed'));
    }
    cb(null, true);
  },
});

router.post('/image', requireAuth, requireRole('admin'), (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      // multer/file-filter errors are already safe, user-facing messages.
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file received' });
    }
    // Relative path — the frontend prefixes it with the API base URL, so this
    // works the same whether the API is reached via IP, domain, or a proxy.
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

module.exports = router;
