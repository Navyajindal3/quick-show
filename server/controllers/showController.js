const Show = require('../models/Show');
const Theatre = require('../models/Theatre');
const redis = require('../config/redis');
const crypto = require('crypto');
const { releaseOwnedLocks } = require('../utils/redisHelpers');

/**
 * Helper: Generate seat map for a show.
 * Generates seat categories dynamically based on Theatre screen tierConfig.
 */
const generateSeatMap = (tierConfig) => {
  const seatMap = {};

  if (!tierConfig || tierConfig.length === 0) {
    // Fallback: simple 60-seat Standard layout
    const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, 6);
    for (const row of rowLabels) {
      for (let col = 1; col <= 10; col++) {
        seatMap[`${row}${col}`] = { status: 'available', category: 'Standard' };
      }
    }
    return seatMap;
  }

  for (const tier of tierConfig) {
    for (const row of tier.rows) {
      for (let col = 1; col <= tier.seatsPerRow; col++) {
        seatMap[`${row}${col}`] = { status: 'available', category: tier.categoryName };
      }
    }
  }

  return seatMap;
};

/**
 * @desc    Get shows for a specific movie (with populated theatre info)
 * @route   GET /api/shows/movie/:movieId
 * @access  Public
 */
const getShowsByMovie = async (req, res, next) => {
  try {
    const { date } = req.query;
    const filter = {
      movie: req.params.movieId,
      isActive: true,
      showTime: { $gte: new Date() }, // Only future shows
    };

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.showTime = { $gte: startOfDay, $lte: endOfDay };
    }

    const shows = await Show.find(filter)
      .populate('theatre', 'name location')
      .populate('movie', 'title duration language')
      .sort({ showTime: 1 });

    res.status(200).json({ success: true, count: shows.length, shows });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single show with full seat map
 * @route   GET /api/shows/:id
 * @access  Public
 */
const getShowById = async (req, res, next) => {
  try {
    const show = await Show.findById(req.params.id)
      .populate('movie')
      .populate('theatre');

    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }

    // Query Redis for temporarily locked seats
    const lockPattern = `lock:show_${show._id}:seat_*`;
    const keys = await redis.keys(lockPattern);

    if (keys.length > 0) {
      keys.forEach((key) => {
        const seatLabel = key.split('seat_')[1];
        const seat = show.seats.get(seatLabel);
        if (seat && seat.status !== 'booked') {
          show.seats.set(seatLabel, { status: 'locked', category: seat.category });
        }
      });
    }

    res.status(200).json({ success: true, show });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lock seats temporarily for a user (prevents double booking)
 * @route   PATCH /api/shows/:id/lock-seats
 * @access  Private
 */
const lockSeats = async (req, res, next) => {
  try {
    const { seatLabels } = req.body;
    const showId = req.params.id;

    if (!Array.isArray(seatLabels) || seatLabels.length === 0) {
      return res.status(400).json({ success: false, message: 'No seats provided' });
    }

    const uniqueSeatLabels = [...new Set(seatLabels)];
    if (uniqueSeatLabels.length !== seatLabels.length) {
      return res.status(400).json({ success: false, message: 'Duplicate seat labels are not allowed' });
    }

    const show = await Show.findById(showId);
    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }

    if (!show.isActive || show.showTime <= new Date()) {
      return res.status(400).json({ success: false, message: 'Show is not active or has already started' });
    }

    const lockedKeys = [];
    let conflict = false;
    const lockToken = crypto.randomUUID();

    for (const label of uniqueSeatLabels) {
      const lockKey = `lock:show_${showId}:seat_${label}`;
      const seat = show.seats.get(label);
      
      if (!seat || seat.status === 'booked') {
        conflict = true;
        break;
      }

      const acquired = await redis.set(lockKey, lockToken, 'EX', 600, 'NX');
      if (!acquired) {
        conflict = true;
        break;
      }
      lockedKeys.push(lockKey);
    }

    if (conflict) {
      if (lockedKeys.length > 0) {
        await redis.del(...lockedKeys);
      }
      return res.status(409).json({
        success: false,
        message: 'One or more seats are already reserved or locked.',
      });
    }

    res.status(200).json({ success: true, message: 'Seats successfully locked', lockToken, expiresIn: 600 });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Release locked seats (e.g., user navigates away from checkout)
 * @route   PATCH /api/shows/:id/release-seats
 * @access  Private
 */
const releaseSeats = async (req, res, next) => {
  try {
    const { seatLabels, lockToken } = req.body;
    const showId = req.params.id;

    if (!Array.isArray(seatLabels) || seatLabels.length === 0 || !lockToken) {
      return res.status(200).json({ success: true, message: 'No seats or lock token to release' });
    }

    await releaseOwnedLocks(showId, seatLabels, lockToken);

    res.status(200).json({ success: true, message: 'Seats released' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all shows (admin)
 * @route   GET /api/shows/admin/all
 * @access  Private/Admin
 */
const getAllShowsAdmin = async (req, res, next) => {
  try {
    const shows = await Show.find()
      .populate('movie', 'title')
      .populate('theatre', 'name location')
      .sort({ showTime: -1 });
    res.status(200).json({ success: true, count: shows.length, shows });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new show (admin)
 * @route   POST /api/shows
 * @access  Private/Admin
 */
const createShow = async (req, res, next) => {
  try {
    const { movie, theatre, screenNumber, showTime, categoryPricing } = req.body;

    // Get theatre to determine screen seat count
    const theatreDoc = await Theatre.findById(theatre);
    if (!theatreDoc) {
      return res.status(404).json({ success: false, message: 'Theatre not found' });
    }

    const screen = theatreDoc.screens.find((s) => s.screenNumber === screenNumber);
    if (!screen) {
      return res.status(400).json({ success: false, message: 'Screen not found in this theatre' });
    }

    const seatMap = generateSeatMap(screen.tierConfig);

    const show = await Show.create({
      movie,
      theatre,
      screenNumber,
      showTime,
      categoryPricing,
      seats: seatMap,
    });

    await show.populate(['movie', 'theatre']);
    res.status(201).json({ success: true, show });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a show (admin)
 * @route   PUT /api/shows/:id
 * @access  Private/Admin
 */
const updateShow = async (req, res, next) => {
  try {
    // Don't allow seat map updates via this route
    const { seats, lockedSeats, ...updateData } = req.body;
    const show = await Show.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate('movie', 'title')
      .populate('theatre', 'name');

    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }
    res.status(200).json({ success: true, show });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a show (admin)
 * @route   DELETE /api/shows/:id
 * @access  Private/Admin
 */
const deleteShow = async (req, res, next) => {
  try {
    const show = await Show.findByIdAndDelete(req.params.id);
    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }
    res.status(200).json({ success: true, message: 'Show deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getShowsByMovie,
  getShowById,
  lockSeats,
  releaseSeats,
  getAllShowsAdmin,
  createShow,
  updateShow,
  deleteShow,
};
