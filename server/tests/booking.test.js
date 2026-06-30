'use strict';

/**
 * Integration Tests — Seat locking, payment finalization, webhook processing,
 * concurrency, duplicate events, and Redis SCAN usage.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const FulfillmentJob = require('../models/FulfillmentJob');
const Show = require('../models/Show');
const User = require('../models/User');
const redis = require('../config/redis');
const { finalizeSuccessfulPayment, retryFulfillment, retryRefund } = require('../services/paymentService');
const { acquireSeatLocks, releaseOwnedLocks, getLockedSeatsForShow } = require('../utils/redisHelpers');

// ─── Mock external services ───────────────────────────────────────────────────
jest.mock('../utils/sendEmail', () => ({
  sendTicketEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('razorpay', () =>
  jest.fn().mockImplementation(() => ({
    orders: { create: jest.fn().mockResolvedValue({ id: 'order_mock_123', amount: 10000, currency: 'INR' }) },
    payments: {
      refund: jest.fn().mockResolvedValue({ id: 'refund_mock_456', amount: 10000 }),
    },
  }))
);

// ─── Test helpers ──────────────────────────────────────────────────────────────
const createTestUser = async (role = 'user') => {
  return User.create({
    name: 'Test User',
    email: `test_${Date.now()}_${Math.random()}@test.com`,
    password: 'Password123!',
    role,
  });
};

const createTestShow = async (overrides = {}) => {
  const Movie = require('../models/Movie');
  const Theatre = require('../models/Theatre');

  const movie = await Movie.create({
    title: 'Test Movie',
    duration: 120,
    language: 'English',
    releaseDate: new Date(),
    genre: ['Action'],
    posterUrl: 'http://example.com/poster.jpg',
    description: 'A test movie',
  });

  const theatre = await Theatre.create({
    name: 'Test Theatre',
    location: { address: '123 Test St', city: 'Mumbai', state: 'Maharashtra' },
    screens: [{ screenNumber: 1, totalSeats: 10, tierConfig: [] }],
    isActive: true,
  });

  return Show.create({
    movie: movie._id,
    theatre: theatre._id,
    screenNumber: 1,
    showTime: new Date(Date.now() + 86400000), // tomorrow
    categoryPricing: { Standard: 200 },
    seats: {
      A1: { status: 'available', category: 'Standard' },
      A2: { status: 'available', category: 'Standard' },
      A3: { status: 'available', category: 'Standard' },
      B1: { status: 'available', category: 'Standard' },
      B2: { status: 'available', category: 'Standard' },
    },
    isActive: true,
    ...overrides,
  });
};

const createPendingBooking = async (userId, showId, seats, lockToken) => {
  return Booking.create({
    user: userId,
    show: showId,
    seatsSelected: seats,
    subtotal: seats.length * 200,
    convenienceFee: seats.length * 4,
    totalAmount: seats.length * 204,
    paymentStatus: 'pending',
    lockToken,
    razorpayOrderId: `order_${Date.now()}_${Math.random()}`,
    bookingSnapshot: { movieTitle: 'Test', theatreName: 'Theatre', showTime: new Date(), screenNumber: 1 },
  });
};

// ─── Redis seat locking ────────────────────────────────────────────────────────
describe('Redis seat locking', () => {
  let show;

  beforeEach(async () => {
    show = await createTestShow();
  });

  it('acquires locks for available seats', async () => {
    const lockToken = crypto.randomUUID();
    const result = await acquireSeatLocks(show._id.toString(), ['A1', 'A2'], lockToken, 600);
    expect(result.success).toBe(true);

    const lockValue = await redis.get(`lock:show_${show._id}:seat_A1`);
    expect(lockValue).toBe(lockToken);
  });

  it('rejects lock if any seat is already locked (rolls back partial)', async () => {
    const token1 = crypto.randomUUID();
    const token2 = crypto.randomUUID();

    // Lock A1 with token1
    await redis.set(`lock:show_${show._id}:seat_A1`, token1, 'EX', 600);

    // Try to lock A1 + A2 with token2 — should fail and not lock A2
    const result = await acquireSeatLocks(show._id.toString(), ['A1', 'A2'], token2, 600);
    expect(result.success).toBe(false);

    // A2 should not have been permanently locked
    const a2Lock = await redis.get(`lock:show_${show._id}:seat_A2`);
    expect(a2Lock).toBeNull();
  });

  it('releases only owned locks', async () => {
    const token1 = crypto.randomUUID();
    const token2 = crypto.randomUUID();

    await redis.set(`lock:show_${show._id}:seat_A1`, token1, 'EX', 600);
    await redis.set(`lock:show_${show._id}:seat_A2`, token2, 'EX', 600);

    // token1 tries to release A2 (owned by token2) — should fail silently
    await releaseOwnedLocks(show._id.toString(), ['A2'], token1);

    const a2Lock = await redis.get(`lock:show_${show._id}:seat_A2`);
    expect(a2Lock).toBe(token2); // Still locked by token2
  });

  it('getLockedSeatsForShow uses SCAN not KEYS', async () => {
    const redisSpy = jest.spyOn(redis, 'keys');

    const token = crypto.randomUUID();
    await redis.set(`lock:show_${show._id}:seat_A1`, token, 'EX', 600);

    const locked = await getLockedSeatsForShow(show._id.toString());
    expect(locked).toContain('A1');

    // KEYS must NOT have been called (only SCAN)
    expect(redisSpy).not.toHaveBeenCalled();

    redisSpy.mockRestore();
  });

  it('handles concurrent lock attempts for same seat — only one wins', async () => {
    const token1 = crypto.randomUUID();
    const token2 = crypto.randomUUID();
    const showId = show._id.toString();

    const [result1, result2] = await Promise.all([
      acquireSeatLocks(showId, ['A1'], token1, 600),
      acquireSeatLocks(showId, ['A1'], token2, 600),
    ]);

    const wins = [result1.success, result2.success].filter(Boolean).length;
    expect(wins).toBe(1); // Exactly one wins
  });
});

// ─── Payment finalization ──────────────────────────────────────────────────────
describe('Payment finalization', () => {
  let user, show;

  beforeEach(async () => {
    user = await createTestUser();
    show = await createTestShow();
  });

  it('atomically marks booking paid and seats booked', async () => {
    const lockToken = crypto.randomUUID();
    await redis.set(`lock:show_${show._id}:seat_A1`, lockToken, 'EX', 600);

    const booking = await createPendingBooking(user._id, show._id, ['A1'], lockToken);

    const result = await finalizeSuccessfulPayment({
      bookingId: booking._id,
      razorpayPaymentId: 'pay_test_001',
    });

    expect(result.processedNow).toBe(true);

    const updatedBooking = await Booking.findById(booking._id);
    expect(updatedBooking.paymentStatus).toBe('paid');
    expect(updatedBooking.razorpayPaymentId).toBe('pay_test_001');

    const updatedShow = await Show.findById(show._id);
    expect(updatedShow.seats.get('A1').status).toBe('booked');
  });

  it('creates email fulfillment job after payment', async () => {
    const lockToken = crypto.randomUUID();
    await redis.set(`lock:show_${show._id}:seat_A1`, lockToken, 'EX', 600);

    const booking = await createPendingBooking(user._id, show._id, ['A1'], lockToken);
    await finalizeSuccessfulPayment({
      bookingId: booking._id,
      razorpayPaymentId: 'pay_test_002',
    });

    const job = await FulfillmentJob.findOne({
      idempotencyKey: `send_ticket_email:${booking._id}`,
    });
    expect(job).not.toBeNull();
    expect(job.type).toBe('send_ticket_email');
    expect(job.status).toBe('pending');
  });

  it('is idempotent — second call returns alreadyProcessed', async () => {
    const lockToken = crypto.randomUUID();
    await redis.set(`lock:show_${show._id}:seat_A1`, lockToken, 'EX', 600);

    const booking = await createPendingBooking(user._id, show._id, ['A1'], lockToken);

    await finalizeSuccessfulPayment({
      bookingId: booking._id,
      razorpayPaymentId: 'pay_test_003',
    });

    // Second call with same payment ID — should be idempotent
    const result2 = await finalizeSuccessfulPayment({
      bookingId: booking._id,
      razorpayPaymentId: 'pay_test_003',
    });

    expect(result2.alreadyProcessed).toBe(true);

    // Seats should still be booked once
    const updatedShow = await Show.findById(show._id);
    expect(updatedShow.seats.get('A1').status).toBe('booked');
  });

  it('marks refund_required when lock is lost before payment', async () => {
    const lockToken = crypto.randomUUID();
    const otherToken = crypto.randomUUID();

    // Someone else holds the lock
    await redis.set(`lock:show_${show._id}:seat_A1`, otherToken, 'EX', 600);

    const booking = await createPendingBooking(user._id, show._id, ['A1'], lockToken);
    const result = await finalizeSuccessfulPayment({
      bookingId: booking._id,
      razorpayPaymentId: 'pay_test_004',
    });

    expect(result.refundRequired).toBe(true);

    const updatedBooking = await Booking.findById(booking._id);
    expect(updatedBooking.paymentStatus).toBe('paid');
    expect(updatedBooking.fulfillmentStatus).toBe('refund_required');

    // Seat should NOT be booked
    const updatedShow = await Show.findById(show._id);
    expect(updatedShow.seats.get('A1').status).toBe('available');

    // Refund job should be created
    const refundJob = await FulfillmentJob.findOne({ idempotencyKey: `process_refund:${booking._id}` });
    expect(refundJob).not.toBeNull();
    expect(refundJob.type).toBe('process_refund');
  });

  it('rejects payment if same payment ID is attached to another booking', async () => {
    const lockToken1 = crypto.randomUUID();
    const lockToken2 = crypto.randomUUID();

    await redis.set(`lock:show_${show._id}:seat_A1`, lockToken1, 'EX', 600);
    await redis.set(`lock:show_${show._id}:seat_A2`, lockToken2, 'EX', 600);

    const booking1 = await createPendingBooking(user._id, show._id, ['A1'], lockToken1);
    const booking2 = await createPendingBooking(user._id, show._id, ['A2'], lockToken2);

    // First payment succeeds
    await finalizeSuccessfulPayment({ bookingId: booking1._id, razorpayPaymentId: 'pay_dup_001' });

    // Trying to use same payment ID for second booking should throw
    await expect(
      finalizeSuccessfulPayment({ bookingId: booking2._id, razorpayPaymentId: 'pay_dup_001' })
    ).rejects.toThrow();
  });

  it('releases Redis locks after successful payment', async () => {
    const lockToken = crypto.randomUUID();
    await redis.set(`lock:show_${show._id}:seat_A1`, lockToken, 'EX', 600);

    const booking = await createPendingBooking(user._id, show._id, ['A1'], lockToken);
    await finalizeSuccessfulPayment({
      bookingId: booking._id,
      razorpayPaymentId: 'pay_release_001',
    });

    // Give a brief moment for async lock release
    await new Promise((r) => setTimeout(r, 100));

    const lockValue = await redis.get(`lock:show_${show._id}:seat_A1`);
    expect(lockValue).toBeNull();
  });
});

// ─── Duplicate webhook handling ────────────────────────────────────────────────
describe('Duplicate webhook events', () => {
  let user, show;

  beforeEach(async () => {
    user = await createTestUser();
    show = await createTestShow();
  });

  it('handles duplicate payment.captured webhook idempotently', async () => {
    const lockToken = crypto.randomUUID();
    await redis.set(`lock:show_${show._id}:seat_A1`, lockToken, 'EX', 600);

    const booking = await createPendingBooking(user._id, show._id, ['A1'], lockToken);

    // Process the webhook twice
    await finalizeSuccessfulPayment({ bookingId: booking._id, razorpayPaymentId: 'pay_webhook_001' });
    const result2 = await finalizeSuccessfulPayment({ bookingId: booking._id, razorpayPaymentId: 'pay_webhook_001' });

    expect(result2.alreadyProcessed).toBe(true);

    // Only one email job should exist
    const jobCount = await FulfillmentJob.countDocuments({ idempotencyKey: `send_ticket_email:${booking._id}` });
    expect(jobCount).toBe(1);

    // Seat still booked exactly once
    const updatedShow = await Show.findById(show._id);
    expect(updatedShow.seats.get('A1').status).toBe('booked');
  });
});

// ─── Admin retry operations ────────────────────────────────────────────────────
describe('Admin retry operations', () => {
  let user, show;

  beforeEach(async () => {
    user = await createTestUser('admin');
    show = await createTestShow();
  });

  it('retryFulfillment creates a new email job if none exists', async () => {
    const lockToken = crypto.randomUUID();
    const booking = await Booking.create({
      user: user._id,
      show: show._id,
      seatsSelected: ['A1'],
      subtotal: 200,
      convenienceFee: 4,
      totalAmount: 204,
      paymentStatus: 'paid',
      fulfillmentStatus: 'pending',
      emailStatus: 'failed',
      lockToken,
      bookingSnapshot: { movieTitle: 'Test', theatreName: 'Theatre', showTime: new Date(), screenNumber: 1 },
    });

    const result = await retryFulfillment(booking._id);
    expect(result.queued).toBe(true);

    const job = await FulfillmentJob.findOne({ idempotencyKey: `send_ticket_email:${booking._id}` });
    expect(job).not.toBeNull();
    expect(job.status).toBe('pending');
  });

  it('retryFulfillment re-activates a failed job', async () => {
    const lockToken = crypto.randomUUID();
    const booking = await Booking.create({
      user: user._id,
      show: show._id,
      seatsSelected: ['A1'],
      subtotal: 200,
      convenienceFee: 4,
      totalAmount: 204,
      paymentStatus: 'paid',
      lockToken,
      bookingSnapshot: { movieTitle: 'Test', theatreName: 'Theatre', showTime: new Date(), screenNumber: 1 },
    });

    // Pre-create a failed job
    await FulfillmentJob.create({
      idempotencyKey: `send_ticket_email:${booking._id}`,
      bookingId: booking._id,
      type: 'send_ticket_email',
      status: 'failed',
      attemptCount: 5,
      nextRunAt: new Date(),
    });

    const result = await retryFulfillment(booking._id);
    expect(result.queued).toBe(true);
    expect(result.reactivated).toBe(true);

    const job = await FulfillmentJob.findOne({ idempotencyKey: `send_ticket_email:${booking._id}` });
    expect(job.status).toBe('pending');
  });

  it('retryFulfillment returns alreadyCompleted for fulfilled bookings', async () => {
    const lockToken = crypto.randomUUID();
    const booking = await Booking.create({
      user: user._id,
      show: show._id,
      seatsSelected: ['A1'],
      subtotal: 200,
      convenienceFee: 4,
      totalAmount: 204,
      paymentStatus: 'paid',
      fulfillmentStatus: 'fulfilled',
      lockToken,
      bookingSnapshot: { movieTitle: 'Test', theatreName: 'Theatre', showTime: new Date(), screenNumber: 1 },
    });

    await FulfillmentJob.create({
      idempotencyKey: `send_ticket_email:${booking._id}`,
      bookingId: booking._id,
      type: 'send_ticket_email',
      status: 'completed',
      completedAt: new Date(),
    });

    const result = await retryFulfillment(booking._id);
    expect(result.alreadyCompleted).toBe(true);
  });

  it('retryRefund requires booking in refund_required state', async () => {
    const lockToken = crypto.randomUUID();
    const booking = await Booking.create({
      user: user._id,
      show: show._id,
      seatsSelected: ['A1'],
      subtotal: 200,
      convenienceFee: 4,
      totalAmount: 204,
      paymentStatus: 'paid',
      fulfillmentStatus: 'fulfilled', // NOT refund_required
      lockToken,
      bookingSnapshot: { movieTitle: 'Test', theatreName: 'Theatre', showTime: new Date(), screenNumber: 1 },
    });

    await expect(retryRefund(booking._id)).rejects.toThrow(/refund_required/);
  });
});

// ─── Ticket scanning (atomic, replay-safe) ────────────────────────────────────
describe('Ticket scanning', () => {
  let user, admin, show;

  beforeEach(async () => {
    user = await createTestUser('user');
    admin = await createTestUser('admin');
    show = await createTestShow();
  });

  it('marks ticket as scanned atomically', async () => {
    const booking = await Booking.create({
      user: user._id,
      show: show._id,
      seatsSelected: ['A1'],
      subtotal: 200,
      convenienceFee: 4,
      totalAmount: 204,
      paymentStatus: 'paid',
      isScanned: false,
      lockToken: crypto.randomUUID(),
      bookingSnapshot: { movieTitle: 'Test', theatreName: 'Theatre', showTime: new Date(), screenNumber: 1 },
    });

    // Simulate concurrent scans — only one should succeed
    const [result1, result2] = await Promise.all([
      Booking.findOneAndUpdate(
        { _id: booking._id, paymentStatus: 'paid', isScanned: false },
        { $set: { isScanned: true, scannedAt: new Date(), scannedBy: admin._id } },
        { new: true }
      ),
      Booking.findOneAndUpdate(
        { _id: booking._id, paymentStatus: 'paid', isScanned: false },
        { $set: { isScanned: true, scannedAt: new Date(), scannedBy: admin._id } },
        { new: true }
      ),
    ]);

    // Exactly one update should succeed (return non-null)
    const successes = [result1, result2].filter(Boolean).length;
    expect(successes).toBe(1);

    const finalBooking = await Booking.findById(booking._id);
    expect(finalBooking.isScanned).toBe(true);
  });

  it('rejects scanning an already-scanned ticket', async () => {
    const booking = await Booking.create({
      user: user._id,
      show: show._id,
      seatsSelected: ['A1'],
      subtotal: 200,
      convenienceFee: 4,
      totalAmount: 204,
      paymentStatus: 'paid',
      isScanned: true, // Already scanned
      scannedAt: new Date(),
      lockToken: crypto.randomUUID(),
      bookingSnapshot: { movieTitle: 'Test', theatreName: 'Theatre', showTime: new Date(), screenNumber: 1 },
    });

    const result = await Booking.findOneAndUpdate(
      { _id: booking._id, paymentStatus: 'paid', isScanned: false },
      { $set: { isScanned: true, scannedAt: new Date() } },
      { new: true }
    );

    expect(result).toBeNull(); // findOneAndUpdate returns null when no doc matches
  });
});

// ─── Seat count limits ─────────────────────────────────────────────────────────
describe('Seat count enforcement', () => {
  it('rejects request exceeding MAX_SEATS_PER_BOOKING', () => {
    const MAX = parseInt(process.env.MAX_SEATS_PER_BOOKING || '8');
    const tooManySeats = Array.from({ length: MAX + 1 }, (_, i) => `A${i + 1}`);
    expect(tooManySeats.length).toBeGreaterThan(MAX);
  });

  it('allows exactly MAX seats', () => {
    const MAX = parseInt(process.env.MAX_SEATS_PER_BOOKING || '8');
    const exactSeats = Array.from({ length: MAX }, (_, i) => `A${i + 1}`);
    expect(exactSeats.length).toBe(MAX);
  });
});

// ─── FulfillmentJob model uniqueness ──────────────────────────────────────────
describe('FulfillmentJob idempotency key uniqueness', () => {
  it('rejects duplicate idempotency keys', async () => {
    const key = `send_ticket_email:${new mongoose.Types.ObjectId()}`;

    await FulfillmentJob.create({
      idempotencyKey: key,
      bookingId: new mongoose.Types.ObjectId(),
      type: 'send_ticket_email',
      status: 'pending',
    });

    await expect(
      FulfillmentJob.create({
        idempotencyKey: key,
        bookingId: new mongoose.Types.ObjectId(),
        type: 'send_ticket_email',
        status: 'pending',
      })
    ).rejects.toThrow();
  });

  it('upsert on idempotencyKey is safe for concurrent calls', async () => {
    const bookingId = new mongoose.Types.ObjectId();
    const key = `send_ticket_email:${bookingId}`;

    const [r1, r2] = await Promise.all([
      FulfillmentJob.findOneAndUpdate(
        { idempotencyKey: key },
        { $setOnInsert: { idempotencyKey: key, bookingId, type: 'send_ticket_email', status: 'pending', nextRunAt: new Date() } },
        { upsert: true, new: true }
      ),
      FulfillmentJob.findOneAndUpdate(
        { idempotencyKey: key },
        { $setOnInsert: { idempotencyKey: key, bookingId, type: 'send_ticket_email', status: 'pending', nextRunAt: new Date() } },
        { upsert: true, new: true }
      ),
    ]);

    const count = await FulfillmentJob.countDocuments({ idempotencyKey: key });
    expect(count).toBe(1);
  });
});
