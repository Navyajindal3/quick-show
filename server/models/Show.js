const mongoose = require('mongoose');

/**
 * Show Schema
 * Links a Movie to a Theatre screen at a specific date/time.
 *
 * The `seats` field is a Map where:
 *   - Key: seat label, e.g. "A1", "B5", "F10"
 *   - Value: "available" | "locked" | "booked"
 *
 * Seat locking uses atomic MongoDB updates to prevent double-booking.
 * Locked seats expire after 10 minutes via `lockedSeats` TTL tracking.
 */
const showSchema = new mongoose.Schema(
  {
    movie: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Movie',
      required: [true, 'Movie reference is required'],
    },
    theatre: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Theatre',
      required: [true, 'Theatre reference is required'],
    },
    screenNumber: {
      type: Number,
      required: [true, 'Screen number is required'],
    },
    showTime: {
      type: Date,
      required: [true, 'Show time is required'],
    },
    categoryPricing: {
      type: Map,
      of: Number,
      required: [true, 'Category pricing is required'],
      default: {},
    },
    /**
     * seats: Map<seatLabel, seatObject>
     * Initialized when the show is created based on theatre screen total seats and tier config.
     */
    seats: {
      type: Map,
      of: new mongoose.Schema(
        {
          status: { type: String, enum: ['available', 'locked', 'booked'], default: 'available' },
          category: { type: String, required: true },
        },
        { _id: false }
      ),
      default: {},
    },
    /**
     * lockedSeats: tracks who locked which seats and when (for TTL release).
     * Array of { userId, seatLabels, lockedAt }
     */
    lockedSeats: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        seatLabels: [String],
        lockedAt: { type: Date, default: Date.now },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for efficient show lookups by movie and showTime
showSchema.index({ movie: 1, showTime: 1 });
showSchema.index({ theatre: 1, showTime: 1 });

module.exports = mongoose.model('Show', showSchema);
