const Movie = require('../models/Movie');

/**
 * @desc    Get all active movies (public)
 * @route   GET /api/movies
 * @access  Public
 */
const getMovies = async (req, res, next) => {
  try {
    const { genre, language, search } = req.query;
    const filter = { isActive: true };

    if (genre) filter.genre = { $in: [genre] };
    if (language) filter.language = language;
    if (search) filter.title = { $regex: search, $options: 'i' };

    const movies = await Movie.find(filter).sort({ releaseDate: -1 });
    res.status(200).json({ success: true, count: movies.length, movies });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single movie by ID (public)
 * @route   GET /api/movies/:id
 * @access  Public
 */
const getMovieById = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }
    res.status(200).json({ success: true, movie });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new movie (admin)
 * @route   POST /api/movies
 * @access  Private/Admin
 */
const createMovie = async (req, res, next) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, movie });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a movie (admin)
 * @route   PUT /api/movies/:id
 * @access  Private/Admin
 */
const updateMovie = async (req, res, next) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }
    res.status(200).json({ success: true, movie });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a movie (admin)
 * @route   DELETE /api/movies/:id
 * @access  Private/Admin
 */
const deleteMovie = async (req, res, next) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }
    res.status(200).json({ success: true, message: 'Movie deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get ALL movies including inactive (admin)
 * @route   GET /api/movies/admin/all
 * @access  Private/Admin
 */
const getAllMoviesAdmin = async (req, res, next) => {
  try {
    const movies = await Movie.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: movies.length, movies });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMovies, getMovieById, createMovie, updateMovie, deleteMovie, getAllMoviesAdmin };
