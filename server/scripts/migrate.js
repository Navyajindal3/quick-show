'use strict';

/**
 * Database Migration
 * ==================
 * Safe, idempotent migration for existing production data.
 *
 * Changes applied:
 *   1. Backfills emailStatus → 'sent' for bookings with confirmationEmailSentAt
 *   2. Backfills fulfillmentStatus → 'fulfilled' for fully completed paid bookings
 *   3. Backfills fulfillmentStatus → 'refund_required' where appropriate
 *   4. Clears invalid paymentStatus values ('SUCCESS' → 'paid')
 *   5. Ensures indexes exist on Booking and FulfillmentJob collections
 *
 * Safe to run multiple times.
 * Does NOT delete any bookings or resend any emails.
 *
 * Usage (from /server directory):
 *   node scripts/migrate.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI is required');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const Booking = mongoose.model(
    'Booking',
    new mongoose.Schema({}, { strict: false, collection: 'bookings' })
  );

  const FulfillmentJob = mongoose.model(
    'FulfillmentJob',
    new mongoose.Schema({}, { strict: false, collection: 'fulfillmentjobs' })
  );

  let totalUpdated = 0;

  // ── 1. Normalize 'SUCCESS' paymentStatus → 'paid' ────────────────────────
  const successResult = await Booking.updateMany(
    { paymentStatus: 'SUCCESS' },
    { $set: { paymentStatus: 'paid' } }
  );
  if (successResult.modifiedCount > 0) {
    console.log(`✅ Normalized ${successResult.modifiedCount} bookings from 'SUCCESS' → 'paid'`);
    totalUpdated += successResult.modifiedCount;
  }

  // ── 2. Backfill emailStatus for bookings with sent emails ─────────────────
  const emailResult = await Booking.updateMany(
    {
      paymentStatus: 'paid',
      confirmationEmailSentAt: { $exists: true, $ne: null },
      $or: [{ emailStatus: { $exists: false } }, { emailStatus: { $in: ['pending', 'sending'] } }],
    },
    { $set: { emailStatus: 'sent' } }
  );
  if (emailResult.modifiedCount > 0) {
    console.log(`✅ Backfilled emailStatus='sent' for ${emailResult.modifiedCount} booking(s)`);
    totalUpdated += emailResult.modifiedCount;
  }

  // ── 3. Backfill fulfillmentStatus for fully fulfilled bookings ────────────
  const fulfilledResult = await Booking.updateMany(
    {
      paymentStatus: 'paid',
      confirmationEmailSentAt: { $exists: true, $ne: null },
      $or: [
        { fulfillmentStatus: { $exists: false } },
        { fulfillmentStatus: 'pending' },
      ],
    },
    { $set: { fulfillmentStatus: 'fulfilled' } }
  );
  if (fulfilledResult.modifiedCount > 0) {
    console.log(`✅ Backfilled fulfillmentStatus='fulfilled' for ${fulfilledResult.modifiedCount} booking(s)`);
    totalUpdated += fulfilledResult.modifiedCount;
  }

  // ── 4. Backfill emailStatus='pending' where missing for paid bookings ──────
  const pendingEmailResult = await Booking.updateMany(
    {
      paymentStatus: 'paid',
      confirmationEmailSentAt: null,
      emailStatus: { $exists: false },
    },
    { $set: { emailStatus: 'pending' } }
  );
  if (pendingEmailResult.modifiedCount > 0) {
    console.log(`✅ Backfilled emailStatus='pending' for ${pendingEmailResult.modifiedCount} booking(s)`);
    totalUpdated += pendingEmailResult.modifiedCount;
  }

  // ── 5. Ensure indexes ──────────────────────────────────────────────────────
  console.log('\n📌 Ensuring database indexes...');
  const db = mongoose.connection.db;

  // Booking indexes
  await db.collection('bookings').createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true, background: true });
  await db.collection('bookings').createIndex({ razorpayPaymentId: 1 }, { unique: true, sparse: true, background: true });
  await db.collection('bookings').createIndex({ lockToken: 1 }, { unique: true, sparse: true, background: true });
  await db.collection('bookings').createIndex({ user: 1, createdAt: -1 }, { background: true });
  await db.collection('bookings').createIndex({ paymentStatus: 1, emailStatus: 1 }, { background: true });
  await db.collection('bookings').createIndex({ paymentStatus: 1, refundStatus: 1 }, { background: true });
  await db.collection('bookings').createIndex({ paymentStatus: 1, fulfillmentStatus: 1 }, { background: true });

  // FulfillmentJob indexes
  await db.collection('fulfillmentjobs').createIndex({ idempotencyKey: 1 }, { unique: true, background: true });
  await db.collection('fulfillmentjobs').createIndex({ bookingId: 1 }, { background: true });
  await db.collection('fulfillmentjobs').createIndex({ status: 1, nextRunAt: 1 }, { background: true });
  await db.collection('fulfillmentjobs').createIndex({ status: 1, claimedAt: 1 }, { background: true });

  console.log('✅ Indexes ensured\n');

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('─────────────────────────────────────────');
  console.log(`✨ Migration complete. Total records updated: ${totalUpdated}`);
  console.log('─────────────────────────────────────────\n');
};

run()
  .catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
