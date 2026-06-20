const express = require('express');
const router = express.Router();
const {
  getMovies,
  getMovieById,
  createMovie,
  updateMovie,
  deleteMovie,
  getAllMoviesAdmin,
} = require('../controllers/movieController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getMovies);
router.get('/:id', getMovieById);

// Admin-only routes
router.get('/admin/all', protect, adminOnly, getAllMoviesAdmin);
router.post('/', protect, adminOnly, createMovie);
router.put('/:id', protect, adminOnly, updateMovie);
router.delete('/:id', protect, adminOnly, deleteMovie);

module.exports = router;
