'use strict';

/**
 * Reconciliation Service
 * =======================
 * Periodic reconciliation for exceptional booking states.
 *
 * Runs on a schedule to catch:
 *   - Paid bookings with queued emails that haven't been sent yet
 *   - Stuck fulfillment jobs (processing state for too long)
 *   - Bookings needing refunds that have no refund job
 *
 * All operations are idempotent — safe to run repeatedly.
 */

const Booking = require('../models/Booking');
const FulfillmentJob = require('../models/FulfillmentJob');

const STUCK_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Re-queue email jobs for paid bookings where email has not been sent
 * and no active job exists.
 */
const reconcileFailedEmails = async () => {
  const staleBookings = await Booking.find({
    paymentStatus: 'paid',
    emailStatus: { $in: ['pending', 'failed', 'queued'] },
    confirmationEmailSentAt: null,
    // Only look at bookings older than 2 minutes (fresh ones may still be in-flight)
    createdAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) },
  }).select('_id');

  let requeued = 0;
  for (const booking of staleBookings) {
    const idempotencyKey = `send_ticket_email:${booking._id}`;
    const existing = await FulfillmentJob.findOne({ idempotencyKey });

    if (!existing) {
      await FulfillmentJob.create({
        idempotencyKey,
        bookingId: booking._id,
        type: 'send_ticket_email',
        status: 'pending',
        nextRunAt: new Date(),
      }).catch(() => {}); // Ignore duplicate key — job already exists
      requeued++;
    } else if (existing.status === 'failed') {
      // Don't auto-requeue exhausted jobs — require admin action
    } else if (existing.status === 'completed') {
      // Mark booking as fulfilled
      await Booking.updateOne(
        { _id: booking._id, emailStatus: { $ne: 'sent' } },
        { $set: { emailStatus: 'sent', fulfillmentStatus: 'fulfilled' } }
      );
    }
  }

  if (requeued > 0) {
    console.log(`[reconcile] Requeued email jobs for ${requeued} booking(s)`);
  }
};

/**
 * Create refund jobs for bookings that need refunds but have no job.
 */
const reconcileRefunds = async () => {
  const refundNeeded = await Booking.find({
    fulfillmentStatus: 'refund_required',
    refundStatus: { $in: ['none', 'failed'] },
    razorpayPaymentId: { $exists: true, $ne: null },
  }).select('_id totalAmount razorpayPaymentId');

  let created = 0;
  for (const booking of refundNeeded) {
    const idempotencyKey = `process_refund:${booking._id}`;
    const existing = await FulfillmentJob.findOne({ idempotencyKey });
    if (!existing) {
      await FulfillmentJob.create({
        idempotencyKey,
        bookingId: booking._id,
        type: 'process_refund',
        status: 'pending',
        nextRunAt: new Date(),
        payload: {
          razorpayPaymentId: booking.razorpayPaymentId,
          refundAmount: booking.totalAmount,
          refundIdempotencyKey: `quickshow-refund-${booking._id}`,
        },
      }).catch(() => {});
      created++;
    }
  }

  if (created > 0) {
    console.log(`[reconcile] Created refund jobs for ${created} booking(s)`);
  }
};

/**
 * Reset stuck processing jobs so the worker can re-claim them.
 */
const reconcileStuckJobs = async () => {
  const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_TIMEOUT_MS);
  const result = await FulfillmentJob.updateMany(
    { status: 'processing', claimedAt: { $lt: stuckCutoff } },
    { $set: { status: 'pending', nextRunAt: new Date(), claimedAt: null } }
  );
  if (result.modifiedCount > 0) {
    console.log(`[reconcile] Reset ${result.modifiedCount} stuck job(s)`);
  }
};

/**
 * Run full reconciliation. Idempotent and safe to run repeatedly.
 */
const runReconciliation = async () => {
  console.log('[reconcile] Starting reconciliation pass...');
  try {
    await reconcileFailedEmails();
    await reconcileRefunds();
    await reconcileStuckJobs();
    console.log('[reconcile] Reconciliation pass complete');
  } catch (err) {
    console.error('[reconcile] Reconciliation error:', err.message);
  }
};

module.exports = { runReconciliation };
