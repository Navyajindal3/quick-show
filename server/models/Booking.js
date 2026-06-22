const mongoose = require('mongoose');

/**
 * Booking Schema
 * Created when a user selects seats. Initially 'pending' until Stripe confirms payment.
 * On payment success: status → 'paid', seats permanently booked, QR code generated.
 */
const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    show: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Show',
      required: [true, 'Show reference is required'],
    },
    seatsSelected: {
      type: [String], // e.g., ['A1', 'A2', 'B3']
      required: [true, 'At least one seat must be selected'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    stripeSessionId: {
      type: String,
      default: null,
    },
    stripePaymentId: {
      type: String,
      default: null, // Filled after successful Stripe webhook
    },
    qrCodeUrl: {
      type: String,
      default: null, // Base64 data URL of the QR code image
    },
    isScanned: {
      type: Boolean,
      default: false, // Tracks if the QR code has been verified by the theatre admin
    },
    // Snapshot of movie/show info at booking time (for receipt display even if show is deleted)
    bookingSnapshot: {
      movieTitle: String,
      theatreName: String,
      showTime: Date,
      screenNumber: Number,
      ticketPrice: Number,
    },
  },
  { timestamps: true }
);

// Index for fetching user's bookings quickly
bookingSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
