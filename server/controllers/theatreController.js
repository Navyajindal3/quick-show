const Theatre = require('../models/Theatre');

/**
 * @desc    Get all active theatres (public)
 * @route   GET /api/theatres
 * @access  Public
 */
const getTheatres = async (req, res, next) => {
  try {
    const { search } = req.query;
    const query = { isActive: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'location.city': { $regex: search, $options: 'i' } },
      ];
    }

    const theatres = await Theatre.find(query);
    res.status(200).json({ success: true, count: theatres.length, theatres });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all theatres including inactive (admin)
 * @route   GET /api/theatres/admin/all
 * @access  Private/Admin
 */
const getAllTheatresAdmin = async (req, res, next) => {
  try {
    const { search } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'location.city': { $regex: search, $options: 'i' } },
      ];
    }

    const theatres = await Theatre.find(query).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: theatres.length, theatres });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single theatre by ID
 * @route   GET /api/theatres/:id
 * @access  Public
 */
const getTheatreById = async (req, res, next) => {
  try {
    const theatre = await Theatre.findById(req.params.id);
    if (!theatre) {
      return res.status(404).json({ success: false, message: 'Theatre not found' });
    }
    res.status(200).json({ success: true, theatre });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new theatre (admin)
 * @route   POST /api/theatres
 * @access  Private/Admin
 */
const createTheatre = async (req, res, next) => {
  try {
    const theatre = await Theatre.create(req.body);
    res.status(201).json({ success: true, theatre });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a theatre (admin)
 * @route   PUT /api/theatres/:id
 * @access  Private/Admin
 */
const updateTheatre = async (req, res, next) => {
  try {
    const theatre = await Theatre.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!theatre) {
      return res.status(404).json({ success: false, message: 'Theatre not found' });
    }
    res.status(200).json({ success: true, theatre });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a theatre (admin)
 * @route   DELETE /api/theatres/:id
 * @access  Private/Admin
 */
const deleteTheatre = async (req, res, next) => {
  try {
    const theatre = await Theatre.findByIdAndDelete(req.params.id);
    if (!theatre) {
      return res.status(404).json({ success: false, message: 'Theatre not found' });
    }
    res.status(200).json({ success: true, message: 'Theatre deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTheatres, getAllTheatresAdmin, getTheatreById, createTheatre, updateTheatre, deleteTheatre };
