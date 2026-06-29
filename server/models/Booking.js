const mongoose = require('mongoose');

/**
 * Booking Schema
 * Created when a user selects seats. Initially pending until payment is confirmed.
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
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    convenienceFee: {
      type: Number,
      required: true,
      min: 0,
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
    orderCreationStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed'],
      default: 'pending',
    },
    orderCreationStartedAt: Date,
    orderCreationAttemptId: String,
    orderCreationError: String,
    fulfillmentStatus: {
      type: String,
      enum: ['pending', 'fulfilled', 'refund_required'],
      default: 'pending',
    },
    emailStatus: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'failed'],
      default: 'pending',
    },
    qrStatus: {
      type: String,
      enum: ['pending', 'generating', 'generated', 'failed'],
      default: 'pending',
    },
    qrGeneratedAt: Date,
    confirmationEmailSentAt: Date,
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'processed', 'failed'],
      default: 'none',
    },
    refundId: {
      type: String,
      unique: true,
      sparse: true,
    },
    refundIdempotencyKey: String,
    refundFailureReason: String,
    refundRequestedAt: Date,
    refundProcessedAt: Date,
    lockToken: {
      type: String,
      unique: true,
      sparse: true,
    },
    lockExpiresAt: {
      type: Date,
    },
    razorpayOrderId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      unique: true,
      sparse: true,
    },
    qrCodeUrl: {
      type: String,
      default: null, // Base64 data URL of the QR code image
    },
    isScanned: {
      type: Boolean,
      default: false, // Tracks if the QR code has been verified by the theatre admin
    },
    scannedAt: Date,
    scannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
