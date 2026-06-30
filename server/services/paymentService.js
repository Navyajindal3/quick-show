'use strict';

/**
 * Payment Service
 * ===============
 * Handles payment finalization atomically and durably.
 *
 * Design principles:
 *   1. Verify payment/webhook signature BEFORE calling this service.
 *   2. The MongoDB transaction ONLY writes booking + show seat state + job record.
 *      NO external API calls (email, Razorpay) happen inside the transaction.
 *   3. After committing, enqueue a FulfillmentJob so the worker processes
 *      email/refund asynchronously and with retries.
 *   4. All state transitions are idempotent — safe to call multiple times.
 */

const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Show = require('../models/Show');
const FulfillmentJob = require('../models/FulfillmentJob');
const redis = require('../config/redis');
const { releaseOwnedLocks } = require('../utils/redisHelpers');

/**
 * Finalize a successful Razorpay payment.
 *
 * @param {{ bookingId: string|ObjectId, razorpayPaymentId: string }} params
 * @returns {{ processedNow: boolean, alreadyProcessed: boolean, refundRequired: boolean }}
 */
const finalizeSuccessfulPayment = async ({ bookingId, razorpayPaymentId }) => {
  const session = await mongoose.startSession();
  let result = null;

  try {
    await session.withTransaction(async () => {
      // ── Step 1: Load booking and check for idempotency ──────────────────
      const booking = await Booking.findById(bookingId)
        .populate('user', 'name email')
        .session(session);

      if (!booking) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      // Already paid — idempotent return
      if (booking.paymentStatus === 'paid') {
        result = {
          processedNow: false,
          alreadyProcessed: true,
          refundRequired: booking.fulfillmentStatus === 'refund_required',
        };
        return;
      }

      if (booking.paymentStatus !== 'pending') {
        throw new Error(
          `Booking ${bookingId} is in invalid state '${booking.paymentStatus}' for payment finalization`
        );
      }

      // Guard against the same payment ID being attached to a different booking
      const duplicatePayment = await Booking.findOne({
        razorpayPaymentId,
        _id: { $ne: bookingId },
      }).session(session);
      if (duplicatePayment) {
        throw new Error(
          `Payment ${razorpayPaymentId} is already attached to booking ${duplicatePayment._id}`
        );
      }

      // ── Step 2: Verify lock ownership in Redis ───────────────────────────
      // Extend locks briefly to survive the transaction duration
      let locksValid = true;
      if (booking.lockToken && booking.seatsSelected.length > 0) {
        const verifyScript = `
          for i, key in ipairs(KEYS) do
            if redis.call("get", key) ~= ARGV[1] then
              return 0
            end
          end
          for i, key in ipairs(KEYS) do
            redis.call("expire", key, tonumber(ARGV[2]))
          end
          return 1
        `;
        const keys = booking.seatsSelected.map(
          (label) => `lock:show_${booking.show}:seat_${label}`
        );
        try {
          const scriptResult = await redis.eval(
            verifyScript,
            keys.length,
            ...keys,
            booking.lockToken,
            60 // 60-second extension to survive the transaction
          );
          if (scriptResult === 0) locksValid = false;
        } catch (err) {
          console.warn(`[payment] Lock verification failed for booking ${bookingId}: ${err.message}`);
          locksValid = false;
        }
      }

      // ── Step 3: If lock lost, mark for refund (still atomically) ─────────
      if (!locksValid) {
        await Booking.findOneAndUpdate(
          { _id: bookingId, paymentStatus: 'pending' },
          {
            $set: {
              paymentStatus: 'paid',
              fulfillmentStatus: 'refund_required',
              razorpayPaymentId,
              paidAt: new Date(),
            },
          },
          { session }
        );

        // Create a refund job atomically with the booking update
        const refundIdempotencyKey = `quickshow-refund-${bookingId}`;
        await FulfillmentJob.findOneAndUpdate(
          { idempotencyKey: `process_refund:${bookingId}` },
          {
            $setOnInsert: {
              idempotencyKey: `process_refund:${bookingId}`,
              bookingId,
              type: 'process_refund',
              status: 'pending',
              nextRunAt: new Date(),
              payload: { razorpayPaymentId, refundAmount: booking.totalAmount, refundIdempotencyKey },
            },
          },
          { upsert: true, session }
        );

        result = {
          processedNow: false,
          alreadyProcessed: false,
          refundRequired: true,
        };
        return;
      }

      // ── Step 4: Attempt to book all seats atomically ──────────────────────
      const showFilter = { _id: booking.show };
      booking.seatsSelected.forEach((seatLabel) => {
        showFilter[`seats.${seatLabel}.status`] = { $ne: 'booked' };
      });

      const seatUpdates = {};
      booking.seatsSelected.forEach((seatLabel) => {
        seatUpdates[`seats.${seatLabel}.status`] = 'booked';
      });

      const updatedShow = await Show.findOneAndUpdate(
        showFilter,
        { $set: seatUpdates },
        { session, new: true }
      );

      if (!updatedShow) {
        // Seats were taken by another booking — need refund
        await Booking.findOneAndUpdate(
          { _id: bookingId, paymentStatus: 'pending' },
          {
            $set: {
              paymentStatus: 'paid',
              fulfillmentStatus: 'refund_required',
              razorpayPaymentId,
              paidAt: new Date(),
            },
          },
          { session }
        );

        const refundIdempotencyKey = `quickshow-refund-${bookingId}`;
        await FulfillmentJob.findOneAndUpdate(
          { idempotencyKey: `process_refund:${bookingId}` },
          {
            $setOnInsert: {
              idempotencyKey: `process_refund:${bookingId}`,
              bookingId,
              type: 'process_refund',
              status: 'pending',
              nextRunAt: new Date(),
              payload: { razorpayPaymentId, refundAmount: booking.totalAmount, refundIdempotencyKey },
            },
          },
          { upsert: true, session }
        );

        result = {
          processedNow: false,
          alreadyProcessed: false,
          refundRequired: true,
        };
        return;
      }

      // ── Step 5: Mark booking paid and create email fulfillment job ────────
      await Booking.findOneAndUpdate(
        { _id: bookingId, paymentStatus: 'pending' },
        {
          $set: {
            paymentStatus: 'paid',
            razorpayPaymentId,
            paidAt: new Date(),
            fulfillmentStatus: 'email_queued',
            emailStatus: 'queued',
          },
        },
        { session }
      );

      // Create durable email job — idempotent via upsert on idempotencyKey
      await FulfillmentJob.findOneAndUpdate(
        { idempotencyKey: `send_ticket_email:${bookingId}` },
        {
          $setOnInsert: {
            idempotencyKey: `send_ticket_email:${bookingId}`,
            bookingId,
            type: 'send_ticket_email',
            status: 'pending',
            nextRunAt: new Date(),
            payload: {},
          },
        },
        { upsert: true, session }
      );

      result = {
        processedNow: true,
        alreadyProcessed: false,
        refundRequired: false,
      };
    });

    // ── Step 6: Release Redis locks (OUTSIDE transaction) ────────────────────
    // This is best-effort — locks will expire automatically anyway
    if (result && (result.processedNow || result.alreadyProcessed)) {
      const booking = await Booking.findById(bookingId).select(
        'show seatsSelected lockToken'
      );
      if (booking && booking.lockToken) {
        await releaseOwnedLocks(
          booking.show,
          booking.seatsSelected,
          booking.lockToken
        ).catch((err) => {
          console.warn(
            `[payment] Failed to release Redis locks for booking ${bookingId}: ${err.message}`
          );
        });
      }
    }

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Manually retry fulfillment for a booking (admin action).
 * Creates/re-activates email job without duplicating if already present.
 */
const retryFulfillment = async (bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (booking.paymentStatus !== 'paid') {
    throw new Error(`Cannot retry fulfillment for booking in state '${booking.paymentStatus}'`);
  }

  // Requeue email job
  const emailIdempotencyKey = `send_ticket_email:${bookingId}`;
  const existing = await FulfillmentJob.findOne({ idempotencyKey: emailIdempotencyKey });

  if (!existing) {
    await FulfillmentJob.create({
      idempotencyKey: emailIdempotencyKey,
      bookingId,
      type: 'send_ticket_email',
      status: 'pending',
      nextRunAt: new Date(),
    });
    return { queued: true, created: true };
  }

  if (existing.status === 'completed') {
    return { queued: false, alreadyCompleted: true };
  }

  // Re-activate failed job
  await FulfillmentJob.findByIdAndUpdate(existing._id, {
    $set: {
      status: 'pending',
      nextRunAt: new Date(),
      lastError: null,
    },
  });
  return { queued: true, reactivated: true };
};

/**
 * Manually retry a refund (admin action).
 */
const retryRefund = async (bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (booking.fulfillmentStatus !== 'refund_required') {
    throw new Error(
      `Booking ${bookingId} is not in refund_required state (current: ${booking.fulfillmentStatus})`
    );
  }
  if (booking.refundStatus === 'processed') {
    return { queued: false, alreadyProcessed: true };
  }

  const refundIdempotencyKey = `process_refund:${bookingId}`;
  const existing = await FulfillmentJob.findOne({ idempotencyKey: refundIdempotencyKey });

  if (!existing) {
    await FulfillmentJob.create({
      idempotencyKey: refundIdempotencyKey,
      bookingId,
      type: 'process_refund',
      status: 'pending',
      nextRunAt: new Date(),
      payload: {
        razorpayPaymentId: booking.razorpayPaymentId,
        refundAmount: booking.totalAmount,
        refundIdempotencyKey: `quickshow-refund-${bookingId}`,
      },
    });
    return { queued: true, created: true };
  }

  await FulfillmentJob.findByIdAndUpdate(existing._id, {
    $set: { status: 'pending', nextRunAt: new Date(), lastError: null },
  });
  return { queued: true, reactivated: true };
};

module.exports = {
  finalizeSuccessfulPayment,
  retryFulfillment,
  retryRefund,
};
