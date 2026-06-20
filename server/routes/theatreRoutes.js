const express = require('express');
const router = express.Router();
const {
  getTheatres,
  getAllTheatresAdmin,
  getTheatreById,
  createTheatre,
  updateTheatre,
  deleteTheatre,
} = require('../controllers/theatreController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getTheatres);
router.get('/:id', getTheatreById);

// Admin-only routes
router.get('/admin/all', protect, adminOnly, getAllTheatresAdmin);
router.post('/', protect, adminOnly, createTheatre);
router.put('/:id', protect, adminOnly, updateTheatre);
router.delete('/:id', protect, adminOnly, deleteTheatre);

module.exports = router;
