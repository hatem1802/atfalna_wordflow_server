const express = require('express');
const multer = require('multer');
const {
  authenticate,
  isBeneficiary,
  isStaff
} = require('../middleware/auth');
const TreatmentRequestController = require('../controllers/treatmentRequestController');
const AttachmentController = require('../controllers/attachmentController');

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store in memory; in production, use disk storage
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

// POST /api/treatment-requests - Create (مستفيد only)
router.post('/', authenticate, isBeneficiary, TreatmentRequestController.create);

// GET /api/treatment-requests - List (مستفيد: own only, staff: filtered)
router.get('/', authenticate, TreatmentRequestController.list);

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
