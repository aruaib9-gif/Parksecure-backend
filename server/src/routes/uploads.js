const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');
const { authenticate, HttpError } = require('../middleware/auth');

const router = express.Router();

const uploadRoot = path.resolve(process.cwd(), config.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10) || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(new HttpError(400, `Unsupported file type: ${file.mimetype}`));
    cb(null, true);
  },
});

// POST /api/uploads  (multipart form field: "file") -> { file_url }
router.post('/', authenticate, upload.single('file'), (req, res, next) => {
  if (!req.file) return next(new HttpError(400, 'file field is required (multipart/form-data)'));
  const fileUrl = `${config.appBaseUrl}/uploads/${req.file.filename}`;
  res.status(201).json({ file_url: fileUrl, filename: req.file.filename, size: req.file.size });
});

module.exports = { router, uploadRoot };
