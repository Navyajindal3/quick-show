const mongoose = require('mongoose');

/**
 * Screen sub-schema for a Theatre
 * Each screen has a number and a total seat count
 */
const screenSchema = new mongoose.Schema({
  screenNumber: {
    type: Number,
    required: true,
  },
  totalSeats: {
    type: Number,
    required: true,
    default: 60, // 6 rows x 10 columns default
  },
  tierConfig: [
    {
      categoryName: { type: String, required: true },
      rows: { type: [String], required: true },
      seatsPerRow: { type: Number, required: true },
    },
  ],
});

/**
 * Theatre Schema
 * Represents a physical theatre location with multiple screens
 */
const theatreSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Theatre name is required'],
      trim: true,
    },
    location: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
    },
    screens: {
      type: [screenSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Theatre', theatreSchema);
