'use strict';

/**
 * Booking Schema
 * ==============
 * Represents a user's movie ticket booking.
 *
 * State machine (paymentStatus):
 *   pending → paid → cancelled / refund_pending → refunded / refund_failed
 *           → failed
 *
 * State machine (fulfillmentStatus):
 *   pending → email_queued → fulfilled
 *           → refund_required
 *           → failed
 *
 * Rules enforced here:
 *   - razorpayOrderId, razorpayPaymentId, lockToken, refundId are all
 *     unique sparse indexes — prevents duplicate payment/refund processing.
 *   - paymentStatus enum is the single source of truth for booking state.
 */

const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    show: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Show',
      required: [true, 'Show reference is required'],
      index: true,
    },
    seatsSelected: {
      type: [String],
      required: [true, 'At least one seat must be selected'],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one seat must be selected',
      },
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

    // ─── Payment state machine ─────────────────────────────────────────────
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'cancelled', 'refund_pending', 'refunded', 'refund_failed'],
      default: 'pending',
      index: true,
    },

    // ─── Order creation ────────────────────────────────────────────────────
    orderCreationStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed'],
      default: 'pending',
    },
    orderCreationStartedAt: Date,
    orderCreationAttemptId: String,
    orderCreationError: String,

    // ─── Fulfillment state ─────────────────────────────────────────────────
    fulfillmentStatus: {
      type: String,
      enum: ['pending', 'email_queued', 'fulfilled', 'refund_required', 'failed'],
      default: 'pending',
      index: true,
    },

    emailStatus: {
      type: String,
      enum: ['pending', 'queued', 'sending', 'sent', 'failed'],
      default: 'pending',
      index: true,
    },

    qrStatus: {
      type: String,
      enum: ['pending', 'generated', 'failed'],
      default: 'pending',
    },
    qrGeneratedAt: Date,
    confirmationEmailSentAt: Date,
    paidAt: Date,

    // ─── Refund tracking ───────────────────────────────────────────────────
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'processing', 'processed', 'failed'],
      default: 'none',
      index: true,
    },
    refundId: {
      type: String,
      unique: true,
      sparse: true,
    },
    refundIdempotencyKey: String,
    refundFailureReason: {
      type: String,
      maxlength: 500, // Avoid logging large error blobs
    },
    refundRequestedAt: Date,
    refundProcessedAt: Date,
    refundAmount: Number,
    refundAttemptCount: { type: Number, default: 0 },

    // ─── Seat lock metadata ────────────────────────────────────────────────
    lockToken: {
      type: String,
      unique: true,
      sparse: true,
    },
    lockExpiresAt: Date,

    // ─── Razorpay IDs ──────────────────────────────────────────────────────
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
      index: true,
    },

    // ─── Ticket scanning ───────────────────────────────────────────────────
    isScanned: {
      type: Boolean,
      default: false,
    },
    scannedAt: Date,
    scannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ─── Snapshot for receipts (survives show deletion) ────────────────────
    bookingSnapshot: {
      movieTitle: String,
      theatreName: String,
      showTime: Date,
      screenNumber: Number,
    },

    // ─── Audit timestamps ──────────────────────────────────────────────────
    cancelledAt: Date,
    cancelReason: { type: String, maxlength: 200 },
  },
  { timestamps: true }
);

// ─── Compound indexes ──────────────────────────────────────────────────────────
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ paymentStatus: 1, fulfillmentStatus: 1 });
bookingSchema.index({ paymentStatus: 1, emailStatus: 1 });
bookingSchema.index({ paymentStatus: 1, refundStatus: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
