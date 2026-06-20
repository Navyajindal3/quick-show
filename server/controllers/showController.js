const Show = require('../models/Show');
const Theatre = require('../models/Theatre');

/**
 * Helper: Generate seat map for a show.
 * Rows A–F (6 rows), Columns 1–10 = 60 seats.
 * Supports custom row/col count via theatre screen config.
 */
const generateSeatMap = (rows = 6, cols = 10) => {
  const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, rows);
  const seatMap = {};
  for (const row of rowLabels) {
    for (let col = 1; col <= cols; col++) {
      seatMap[`${row}${col}`] = 'available';
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

    // Release any expired locked seats (locked > 10 min ago)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const expiredLocks = show.lockedSeats.filter(
      (lock) => lock.lockedAt < tenMinutesAgo
    );

    if (expiredLocks.length > 0) {
      const expiredSeatLabels = expiredLocks.flatMap((lock) => lock.seatLabels);

      // Unlock expired seats
      expiredSeatLabels.forEach((label) => {
        if (show.seats.get(label) === 'locked') {
          show.seats.set(label, 'available');
        }
      });

      // Remove expired lock entries
      show.lockedSeats = show.lockedSeats.filter(
        (lock) => lock.lockedAt >= tenMinutesAgo
      );

      await show.save();
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
 *
 * Uses atomic MongoDB findOneAndUpdate with conditions to ensure
 * ALL selected seats are still 'available' before locking.
 */
const lockSeats = async (req, res, next) => {
  try {
    const { seatLabels } = req.body;
    const userId = req.user._id;
    const showId = req.params.id;

    if (!seatLabels || seatLabels.length === 0) {
      return res.status(400).json({ success: false, message: 'No seats provided' });
    }

    // Build atomic query: all requested seats must be 'available'
    const seatConditions = {};
    seatLabels.forEach((label) => {
      seatConditions[`seats.${label}`] = 'available';
    });

    // Build the $set update: mark each seat as 'locked'
    const seatUpdates = {};
    seatLabels.forEach((label) => {
      seatUpdates[`seats.${label}`] = 'locked';
    });

    const updatedShow = await Show.findOneAndUpdate(
      { _id: showId, ...seatConditions }, // Atomic condition
      {
        $set: seatUpdates,
        $push: {
          lockedSeats: {
            userId,
            seatLabels,
            lockedAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!updatedShow) {
      return res.status(409).json({
        success: false,
        message: 'One or more selected seats are no longer available. Please refresh and try again.',
      });
    }

    res.status(200).json({ success: true, message: 'Seats locked successfully', show: updatedShow });
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
    const { seatLabels } = req.body;
    const userId = req.user._id;
    const showId = req.params.id;

    const show = await Show.findById(showId);
    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }

    // Only release seats that this user locked
    seatLabels.forEach((label) => {
      if (show.seats.get(label) === 'locked') {
        show.seats.set(label, 'available');
      }
    });

    // Remove this user's lock record
    show.lockedSeats = show.lockedSeats.filter(
      (lock) => lock.userId.toString() !== userId.toString()
    );

    await show.save();
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
    const { movie, theatre, screenNumber, showTime, ticketPrice } = req.body;

    // Get theatre to determine screen seat count
    const theatreDoc = await Theatre.findById(theatre);
    if (!theatreDoc) {
      return res.status(404).json({ success: false, message: 'Theatre not found' });
    }

    const screen = theatreDoc.screens.find((s) => s.screenNumber === screenNumber);
    if (!screen) {
      return res.status(400).json({ success: false, message: 'Screen not found in this theatre' });
    }

    // Calculate rows/cols from totalSeats (assuming 10 cols)
    const cols = 10;
    const rows = Math.ceil(screen.totalSeats / cols);
    const seatMap = generateSeatMap(rows, cols);

    const show = await Show.create({
      movie,
      theatre,
      screenNumber,
      showTime,
      ticketPrice,
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
