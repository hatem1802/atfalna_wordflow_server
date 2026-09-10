const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const {
  authenticate,
  authenticateFromDb,
  isBeneficiary,
  isStaff
} = require('../middleware/auth');
const TreatmentRequestController = require('../controllers/treatmentRequestController');
const AttachmentController = require('../controllers/attachmentController');

const uploadDir = path.join(__dirname, '..', 'uploads', 'treatment-requests');
fs.mkdirSync(uploadDir, { recursive: true });


function sanitizeOwnerName(user = {}) {
  const raw = user.display_name || user.name || user.user_nicename || 'beneficiary';
  const cleaned = String(raw)
    .replace(/[/\\:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-');
  return cleaned || 'beneficiary';
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const ownerName = sanitizeOwnerName(req.user);
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${ownerName}-${uniqueId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

const router = express.Router();

/**
 * Treatment Request Status Routes
 */

// GET /api/treatment-requests/statuses
router.get('/statuses', authenticate, TreatmentRequestController.getStatuses);

/**
 * Treatment Request CRUD Routes
 */

// POST /api/treatment-requests - Create (مستفيد only) with optional files
router.post(
  '/',
  authenticate,
  isBeneficiary,
  upload.array('files', 10),
  TreatmentRequestController.create
);

// GET /api/treatment-requests - List (مستفيد: own only, staff: filtered)
router.get('/', authenticate, TreatmentRequestController.list);

// GET /api/treatment-requests/by-role - Requests at the user's workflow stage
// Must be registered before /:id so "by-role" is not treated as an id
router.get(
  '/by-role',
  authenticateFromDb,
  TreatmentRequestController.listByRole
);

// GET /api/treatment-requests/:id - Get single
router.get('/:id', authenticate, TreatmentRequestController.getById);

// PUT /api/treatment-requests/:id - Update
router.patch('/:id', authenticate, TreatmentRequestController.update);
router.put('/:id', authenticate, TreatmentRequestController.update);

// PUT /api/treatment-requests/:id/status - Update status
router.put('/:id/status', authenticate, isStaff, TreatmentRequestController.updateStatus);

// DELETE /api/treatment-requests/:id - Delete
router.delete('/:id', authenticate, TreatmentRequestController.delete);

/**
 * Attachment Routes
 */

// POST /api/treatment-requests/:requestId/attachments - Upload file
router.post(
  '/:requestId/attachments',
  authenticate,
  upload.single('file'),
  AttachmentController.upload
);

// GET /api/treatment-requests/:requestId/attachments - List attachments for request
router.get('/:requestId/attachments', authenticate, AttachmentController.list);

// GET /api/attachments/:id - Get single attachment
router.get('/attachment/:id', authenticate, AttachmentController.getById);

// GET /api/attachments/:id/download - Download attachment
router.get('/attachment/:id/download', authenticate, AttachmentController.download);

// PUT /api/attachments/:id - Update attachment metadata
router.put('/attachment/:id', authenticate, AttachmentController.update);

// PUT /api/attachments/:id/replace - Replace file (staff only)
router.put(
  '/attachment/:id/replace',
  authenticate,
  upload.single('file'),
  AttachmentController.replaceFile
);

// DELETE /api/attachments/:id - Delete attachment
router.delete('/attachment/:id', authenticate, AttachmentController.delete);

module.exports = router;
