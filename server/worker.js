'use strict';

/**
 * Fulfillment Worker
 * ==================
 * Processes durable FulfillmentJob records created after successful payments.
 *
 * Worker design:
 *   - Polls MongoDB for pending jobs ready to run (nextRunAt <= now)
 *   - Atomically claims each job (status: pending → processing)
 *   - Processes the job (send email, process refund)
 *   - Marks job completed or retries with exponential backoff
 *   - Recovers jobs stuck in 'processing' after worker crash
 *   - Graceful shutdown on SIGTERM/SIGINT
 *
 * Run alongside the main server:
 *   node worker.js
 */

require('dotenv').config();

// Load and validate environment config first
const config = require('./config/env');

const mongoose = require('mongoose');
const FulfillmentJob = require('./models/FulfillmentJob');
const Booking = require('./models/Booking');
const { sendTicketEmail } = require('./utils/sendEmail');
const { generateTicketToken } = require('./utils/generateQR');

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 5000;
const STUCK_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

/** Compute exponential backoff delay (seconds) for a given attempt number. */
const backoffSeconds = (attempt) => Math.min(60 * Math.pow(2, attempt), 3600);

let isShuttingDown = false;
let pollTimer = null;

// ─── Job processors ───────────────────────────────────────────────────────────

const processSendTicketEmail = async (job) => {
  const booking = await Booking.findById(job.bookingId).populate('user', 'name email');

  if (!booking) {
    throw new Error(`Booking ${job.bookingId} not found`);
  }

  if (booking.paymentStatus !== 'paid') {
    throw new Error(`Booking ${job.bookingId} is not in paid state (${booking.paymentStatus})`);
  }

  if (booking.emailStatus === 'sent' && booking.confirmationEmailSentAt) {
    console.log(`[worker] Email already sent for booking ${job.bookingId}, marking complete`);
    return; // idempotent — already done
  }

  if (!booking.user || !booking.user.email) {
    throw new Error(`Booking ${job.bookingId} has no user email`);
  }

  // Generate ticket token — stable for retries (same booking/user IDs)
  const ticketToken = generateTicketToken(booking._id, booking.user._id);

  const showTime = booking.bookingSnapshot?.showTime
    ? new Date(booking.bookingSnapshot.showTime).toLocaleString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'N/A';

  await sendTicketEmail(booking.user.email, {
    userName: booking.user.name,
    movieName: booking.bookingSnapshot?.movieTitle,
    theatreName: booking.bookingSnapshot?.theatreName,
    showTime,
    screenName: booking.bookingSnapshot?.screenNumber,
    seatsList: booking.seatsSelected?.join(', '),
    amountPaid: booking.totalAmount,
    bookingId: booking._id,
    ticketToken,
    idempotencyKey: `booking-confirmation-${booking._id}`,
  });

  // Mark booking fulfillment complete
  await Booking.findOneAndUpdate(
    { _id: booking._id, emailStatus: { $ne: 'sent' } },
    {
      $set: {
        emailStatus: 'sent',
        confirmationEmailSentAt: new Date(),
        qrStatus: 'generated',
        qrGeneratedAt: new Date(),
        fulfillmentStatus: 'fulfilled',
      },
    }
  );

  console.log(`[worker] ✅ Ticket email sent for booking ${job.bookingId}`);
};

const processRefund = async (job) => {
  const { razorpayPaymentId, refundAmount } = job.payload || {};
  const booking = await Booking.findById(job.bookingId);

  if (!booking) {
    throw new Error(`Booking ${job.bookingId} not found`);
  }

  // Idempotent — if already processed, skip
  if (booking.refundStatus === 'processed') {
    console.log(`[worker] Refund already processed for booking ${job.bookingId}`);
    return;
  }

  if (!razorpayPaymentId) {
    throw new Error(`Job ${job._id} is missing razorpayPaymentId in payload`);
  }

  const Razorpay = require('razorpay');
  const razorpay = new Razorpay({
    key_id: config.RAZORPAY_KEY_ID.trim(),
    key_secret: config.RAZORPAY_KEY_SECRET.trim(),
  });

  // Build idempotency key for Razorpay refund
  const idempotencyKey = booking.refundIdempotencyKey || `quickshow-refund-${booking._id}`;

  await Booking.updateOne(
    { _id: booking._id },
    { $set: { refundStatus: 'processing', refundIdempotencyKey: idempotencyKey } }
  );

  const refundResult = await razorpay.payments.refund(
    razorpayPaymentId,
    { amount: (refundAmount || booking.totalAmount) * 100, speed: 'optimum' },
    { headers: { 'X-Refund-Idempotency': idempotencyKey } }
  );

  await Booking.updateOne(
    { _id: booking._id },
    {
      $set: {
        refundId: refundResult.id,
        refundStatus: 'pending', // Will move to 'processed' via webhook
        refundRequestedAt: new Date(),
        refundAmount: (refundResult.amount || 0) / 100,
      },
    }
  );

  console.log(
    `[worker] ✅ Refund requested for booking ${job.bookingId}. Razorpay refund ID: ${refundResult.id}`
  );
};

// ─── Job dispatch ─────────────────────────────────────────────────────────────

const processJob = async (job) => {
  const correlationId = `job:${job._id}:attempt:${job.attemptCount + 1}`;
  console.log(`[worker] Processing ${job.type} | ${correlationId} | booking=${job.bookingId}`);

  try {
    if (job.type === 'send_ticket_email') {
      await processSendTicketEmail(job);
    } else if (job.type === 'process_refund') {
      await processRefund(job);
    } else {
      throw new Error(`Unknown job type: ${job.type}`);
    }

    // Mark completed
    await FulfillmentJob.findByIdAndUpdate(job._id, {
      $set: { status: 'completed', completedAt: new Date(), claimedAt: null, lastError: null },
    });
    console.log(`[worker] ✅ Completed ${correlationId}`);
  } catch (err) {
    const nextAttempt = (job.attemptCount || 0) + 1;
    const isExhausted = nextAttempt >= MAX_ATTEMPTS;
    const delaySeconds = backoffSeconds(nextAttempt);
    const nextRunAt = new Date(Date.now() + delaySeconds * 1000);

    // Sanitize error message — never log stack traces to persistent storage
    const safeError = (err.message || 'Unknown error').substring(0, 500);

    await FulfillmentJob.findByIdAndUpdate(job._id, {
      $set: {
        status: isExhausted ? 'failed' : 'pending',
        attemptCount: nextAttempt,
        nextRunAt: isExhausted ? undefined : nextRunAt,
        lastError: safeError,
        claimedAt: null,
      },
    });

    if (isExhausted) {
      console.error(
        `[worker] ❌ Job ${correlationId} exhausted after ${nextAttempt} attempts. Manual retry required. Error: ${safeError}`
      );
    } else {
      console.warn(
        `[worker] ⚠️  Job ${correlationId} failed (attempt ${nextAttempt}/${MAX_ATTEMPTS}), retry in ${delaySeconds}s. Error: ${safeError}`
      );
    }
  }
};

// ─── Stuck job recovery ───────────────────────────────────────────────────────

const recoverStuckJobs = async () => {
  const stuckCutoff = new Date(Date.now() - STUCK_JOB_TIMEOUT_MS);
  const result = await FulfillmentJob.updateMany(
    { status: 'processing', claimedAt: { $lt: stuckCutoff } },
    { $set: { status: 'pending', nextRunAt: new Date(), claimedAt: null } }
  );
  if (result.modifiedCount > 0) {
    console.log(`[worker] Recovered ${result.modifiedCount} stuck job(s)`);
  }
};

// ─── Poll cycle ───────────────────────────────────────────────────────────────

const pollOnce = async () => {
  await recoverStuckJobs();

  // Atomically claim one job at a time to avoid concurrent processing
  const job = await FulfillmentJob.findOneAndUpdate(
    {
      status: 'pending',
      nextRunAt: { $lte: new Date() },
    },
    {
      $set: { status: 'processing', claimedAt: new Date() },
      $inc: { attemptCount: 1 },
    },
    { sort: { nextRunAt: 1 }, new: false }
  );

  if (job) {
    // Increment was already applied by findOneAndUpdate, so use returned doc's original count
    job.attemptCount = (job.attemptCount || 0); // pre-increment value
    await processJob(job);
  }
};

const schedulePoll = () => {
  if (isShuttingDown) return;
  pollTimer = setTimeout(async () => {
    try {
      await pollOnce();
    } catch (err) {
      console.error('[worker] Poll cycle error:', err.message);
    }
    schedulePoll();
  }, POLL_INTERVAL_MS);
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal) => {
  console.log(`\n[worker] Received ${signal}, shutting down gracefully...`);
  isShuttingDown = true;
  if (pollTimer) clearTimeout(pollTimer);
  await mongoose.disconnect();
  console.log('[worker] Worker stopped cleanly.');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────────────────────

const start = async () => {
  console.log('[worker] QuickShow Fulfillment Worker starting...');
  await mongoose.connect(config.MONGO_URI);
  console.log('[worker] Connected to MongoDB');
  console.log(`[worker] Polling every ${POLL_INTERVAL_MS / 1000}s`);
  schedulePoll();
};

start().catch((err) => {
  console.error('[worker] Fatal startup error:', err.message);
  process.exit(1);
});
