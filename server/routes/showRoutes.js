const express = require('express');
const router = express.Router();
const {
  getShowsByMovie,
  getShowById,
  lockSeats,
  releaseSeats,
  getAllShowsAdmin,
  createShow,
  updateShow,
  deleteShow,
} = require('../controllers/showController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public routes
router.get('/movie/:movieId', getShowsByMovie);
router.get('/:id', getShowById);

// User routes (requires login)
router.patch('/:id/lock-seats', protect, lockSeats);
router.patch('/:id/release-seats', protect, releaseSeats);

// Admin-only routes
router.get('/admin/all', protect, adminOnly, getAllShowsAdmin);
router.post('/', protect, adminOnly, createShow);
router.put('/:id', protect, adminOnly, updateShow);
router.delete('/:id', protect, adminOnly, deleteShow);

module.exports = router;
