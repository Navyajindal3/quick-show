'use strict';

/**
 * FulfillmentJob Model
 * ====================
 * Durable outbox-style job queue for post-payment side effects.
 * Each job is claimed atomically by a worker and retried with exponential backoff.
 *
 * Job types:
 *   send_ticket_email  — send booking confirmation with QR code
 *   process_refund     — initiate Razorpay refund for a booking
 *
 * State machine:
 *   pending  → processing → completed
 *                        → failed (max retries exhausted)
 *   failed   → pending   (after admin manual retry)
 */

const mongoose = require('mongoose');

const fulfillmentJobSchema = new mongoose.Schema(
  {
    /**
     * Stable idempotency key — prevents duplicate jobs for the same
     * logical operation. Format: "<type>:<bookingId>"
     */
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ['send_ticket_email', 'process_refund'],
      required: true,
    },

    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },

    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxAttempts: {
      type: Number,
      default: 5,
    },

    /** When a worker may next pick up this job (for exponential backoff). */
    nextRunAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },

    /** When a worker last claimed this job. Used to detect stuck jobs. */
    claimedAt: {
      type: Date,
      default: null,
    },

    /** Safe summary of the last error — must never contain secrets. */
    lastError: {
      type: String,
      default: null,
      maxlength: 500,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    /** Arbitrary payload stored with the job (no secrets). */
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Index for worker polling: find pending/processing jobs ready to run
fulfillmentJobSchema.index({ status: 1, nextRunAt: 1 });

// Index for stuck-job recovery: processing jobs whose claimedAt is old
fulfillmentJobSchema.index({ status: 1, claimedAt: 1 });

module.exports = mongoose.model('FulfillmentJob', fulfillmentJobSchema);
