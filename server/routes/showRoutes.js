'use strict';

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
const { seatLockLimiter, adminActionLimiter } = require('../middleware/rateLimiter');

// Public routes
router.get('/movie/:movieId', getShowsByMovie);
router.get('/:id', getShowById);

// User routes (requires login)
router.patch('/:id/lock-seats', protect, seatLockLimiter, lockSeats);
router.patch('/:id/release-seats', protect, releaseSeats);

// Admin-only routes
router.get('/admin/all', protect, adminOnly, getAllShowsAdmin);
router.post('/', protect, adminOnly, adminActionLimiter, createShow);
router.put('/:id', protect, adminOnly, adminActionLimiter, updateShow);
router.delete('/:id', protect, adminOnly, adminActionLimiter, deleteShow);

module.exports = router;
