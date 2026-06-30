'use strict';

const Show = require('../models/Show');
const Theatre = require('../models/Theatre');
const config = require('../config/env');
const {
  acquireSeatLocks,
  releaseOwnedLocks,
  getLockedSeatsForShow,
} = require('../utils/redisHelpers');
const crypto = require('crypto');

// ─── Seat label validation ─────────────────────────────────────────────────────
const SEAT_LABEL_PATTERN = /^[A-Z][1-9]\d*$/;

const validateSeatLabel = (label) => {
  return typeof label === 'string' && SEAT_LABEL_PATTERN.test(label) && label.length <= 4;
};

/**
 * Helper: Generate seat map for a show.
 */
const generateSeatMap = (tierConfig) => {
  const seatMap = {};

  if (!tierConfig || tierConfig.length === 0) {
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
 * @desc    Get shows for a specific movie
 * @route   GET /api/shows/movie/:movieId
 * @access  Public
 */
const getShowsByMovie = async (req, res, next) => {
  try {
    const { date } = req.query;
    const filter = {
      movie: req.params.movieId,
      isActive: true,
      showTime: { $gte: new Date() },
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
 * @desc    Get a single show with full seat map (locked seats overlaid from Redis)
 * @route   GET /api/shows/:id
 * @access  Public
 */
const getShowById = async (req, res, next) => {
  try {
    const show = await Show.findById(req.params.id).populate('movie').populate('theatre');

    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }

    // ── Use SCAN (not KEYS) to find locked seats for this show ──────────────
    const lockedLabels = await getLockedSeatsForShow(show._id.toString());

    if (lockedLabels.length > 0) {
      lockedLabels.forEach((seatLabel) => {
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
 * @desc    Lock seats temporarily (prevents double booking)
 * @route   PATCH /api/shows/:id/lock-seats
 * @access  Private
 */
const lockSeats = async (req, res, next) => {
  try {
    const { seatLabels } = req.body;
    const showId = req.params.id;
    const userId = req.user._id;

    // ── Input validation ───────────────────────────────────────────────────
    if (!Array.isArray(seatLabels) || seatLabels.length === 0) {
      return res.status(400).json({ success: false, message: 'No seats provided' });
    }

    // Deduplicate
    const uniqueSeatLabels = [...new Set(seatLabels)];

    if (uniqueSeatLabels.length > config.MAX_SEATS_PER_BOOKING) {
      return res.status(400).json({
        success: false,
        message: `Cannot lock more than ${config.MAX_SEATS_PER_BOOKING} seats per booking`,
      });
    }

    // Validate seat label format
    const invalidLabels = uniqueSeatLabels.filter((l) => !validateSeatLabel(l));
    if (invalidLabels.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid seat label(s): ${invalidLabels.join(', ')}`,
      });
    }

    // ── Load show and validate seats exist ─────────────────────────────────
    const show = await Show.findById(showId);
    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }

    if (!show.isActive || show.showTime <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Show is not active or has already started',
      });
    }

    // Validate every requested seat exists in this show's layout
    const invalidSeats = uniqueSeatLabels.filter((label) => !show.seats.has(label));
    if (invalidSeats.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Seat(s) not found in this show: ${invalidSeats.join(', ')}`,
      });
    }

    // Check that none are permanently booked
    const alreadyBooked = uniqueSeatLabels.filter(
      (label) => show.seats.get(label)?.status === 'booked'
    );
    if (alreadyBooked.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'One or more selected seats are already booked',
      });
    }

    // ── Generate lock token and acquire Redis locks atomically ─────────────
    const lockToken = crypto.randomUUID();
    const { success, conflictingSeat } = await acquireSeatLocks(
      showId,
      uniqueSeatLabels,
      lockToken,
      config.SEAT_LOCK_TTL_SECONDS
    );

    if (!success) {
      return res.status(409).json({
        success: false,
        message: 'One or more seats are already reserved. Please choose different seats.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Seats successfully locked',
      lockToken,
      expiresIn: config.SEAT_LOCK_TTL_SECONDS,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Release locked seats (user navigates away from checkout)
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

    // Validate seat labels before using in Redis key construction
    const validLabels = seatLabels.filter(validateSeatLabel);
    await releaseOwnedLocks(showId, validLabels, lockToken);

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

    const theatreDoc = await Theatre.findById(theatre);
    if (!theatreDoc) {
      return res.status(404).json({ success: false, message: 'Theatre not found' });
    }

    const screen = theatreDoc.screens.find((s) => s.screenNumber === screenNumber);
    if (!screen) {
      return res.status(400).json({ success: false, message: 'Screen not found in this theatre' });
    }

    const seatMap = generateSeatMap(screen.tierConfig);
    const show = await Show.create({ movie, theatre, screenNumber, showTime, categoryPricing, seats: seatMap });
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
    // Prevent seat map tampering via this route
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
