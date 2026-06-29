const request = require('supertest');
const express = require('express');
process.env.RAZORPAY_KEY_ID = 'rzp_test_123';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_123';
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = express();
// Mock Auth Middleware
jest.mock('../middleware/authMiddleware', () => ({
  protect: (req, res, next) => {
    if (req.headers.authorization === 'Bearer test-user-token') {
      req.user = { _id: global.testUserId, name: 'Test User', email: 'test@test.com' };
      next();
    } else if (req.headers.authorization === 'Bearer admin-token') {
      req.user = { _id: 'admin_id_string', name: 'Admin', role: 'admin' };
      next();
    } else {
      res.status(401).json({ success: false, message: 'Not authorized' });
    }
  },
  adminOnly: (req, res, next) => {
    if (req.user && req.user.role === 'admin') next();
    else res.status(403).json({ success: false, message: 'Admin only' });
  }
}));

app.use(express.json());
const bookingRoutes = require('../routes/bookingRoutes');
const Booking = require('../models/Booking');
const Show = require('../models/Show');
const User = require('../models/User');
const redis = require('../config/redis');
const { releaseOwnedLocks } = require('../utils/redisHelpers');
const { finalizeSuccessfulPayment, ensureBookingFulfillment } = require('../services/paymentService');

// Mock Razorpay
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockResolvedValue({ id: 'order_123', amount: 10000, currency: 'INR' }),
    },
  }));
});

app.use('/api/bookings', bookingRoutes);

describe('Booking Architecture & Concurrency', () => {
  let show, userToken, userId, adminToken;

  beforeEach(async () => {
    const user = await User.create({ name: 'Test User', email: 'test@test.com', password: 'password123', role: 'user' });
    userId = user._id;
    global.testUserId = userId; // pass to middleware mock
    
    userToken = 'Bearer test-user-token';
    adminToken = 'Bearer admin-token';

    const Theatre = require('../models/Theatre');
    const Movie = require('../models/Movie');

    const movie = await Movie.create({ title: 'Test Movie', duration: 120, language: 'English', releaseDate: new Date(), genre: 'Action', posterUrl: 'http://example.com/poster.jpg', description: 'Test description' });
    const theatre = await Theatre.create({ name: 'Test Theatre', location: { address: '123 Test St', city: 'City', state: 'State', zipCode: '12345' }, facilities: [] });

    show = await Show.create({
      movie: movie._id,
      theatre: theatre._id,
      screenNumber: 1,
      showTime: new Date(Date.now() + 86400000), // tomorrow
      categoryPricing: { Standard: 100 },
      seats: { A1: { status: 'available', category: 'Standard' }, A2: { status: 'available', category: 'Standard' } }
    });
  });

  describe('Redis Locking and Order Creation', () => {
    it('should lock seats and extend TTL during createOrder', async () => {
      const lockToken = 'my-secret-lock-token';
      await redis.set(`lock:show_${show._id}:seat_A1`, lockToken, 'EX', 100);

      const res = await request(app)
        .post('/api/bookings/create-order')
        .set('Authorization', userToken)
        .send({ showId: show._id, seatLabels: ['A1'], lockToken });
      
      if (res.status !== 200) console.log(res.body);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      const ttl = await redis.ttl(`lock:show_${show._id}:seat_A1`);
      expect(ttl).toBeGreaterThan(100); // Should be renewed to 600

      const booking = await Booking.findById(res.body.bookingId);
      expect(booking.lockToken).toBe(lockToken);
    });

    it('should be idempotent for double clicks', async () => {
      const lockToken = 'my-secret-lock-token-2';
      await redis.set(`lock:show_${show._id}:seat_A1`, lockToken, 'EX', 100);

      const req1 = request(app)
        .post('/api/bookings/create-order')
        .set('Authorization', userToken)
        .send({ showId: show._id, seatLabels: ['A1'], lockToken });

      const req2 = request(app)
        .post('/api/bookings/create-order')
        .set('Authorization', userToken)
        .send({ showId: show._id, seatLabels: ['A1'], lockToken });

      const [res1, res2] = await Promise.all([req1, req2]);

      // Both should succeed, but one might return 202 (in progress) or 200 (completed)
      expect([200, 202]).toContain(res1.status);
      expect([200, 202]).toContain(res2.status);
      
      // If both are 200, they must share the same booking ID (and razorpay order ID from mock)
      if (res1.status === 200 && res2.status === 200) {
        expect(res1.body.bookingId).toBe(res2.body.bookingId);
      }
    });
  });

  describe('Payment Finalization', () => {
    it('should process payment transaction and cleanup lock atomically', async () => {
      const lockToken = 'my-secret-lock-token-3';
      const booking = await Booking.create({
        user: userId,
        show: show._id,
        seatsSelected: ['A2'],
        subtotal: 100,
        convenienceFee: 2,
        totalAmount: 102,
        paymentStatus: 'pending',
        lockToken,
      });

      await redis.set(`lock:show_${show._id}:seat_A2`, lockToken, 'EX', 600);

      const result = await finalizeSuccessfulPayment({ bookingId: booking._id, razorpayPaymentId: 'pay_123' });
      expect(result.processedNow).toBe(true);

      const updatedShow = await Show.findById(show._id);
      expect(updatedShow.seats.get('A2').status).toBe('booked');

      const lockValue = await redis.get(`lock:show_${show._id}:seat_A2`);
      expect(lockValue).toBeNull(); // lock cleanup succeeded
    });

    it('should mark refund_required if lock was lost before payment', async () => {
      const lockToken = 'my-secret-lock-token-4';
      const booking = await Booking.create({
        user: userId,
        show: show._id,
        seatsSelected: ['A2'],
        subtotal: 100,
        convenienceFee: 2,
        totalAmount: 102,
        paymentStatus: 'pending',
        lockToken,
      });

      // Someone else has the lock now
      await redis.set(`lock:show_${show._id}:seat_A2`, 'different-token', 'EX', 600);

      const result = await finalizeSuccessfulPayment({ bookingId: booking._id, razorpayPaymentId: 'pay_456' });
      expect(result.processedNow).toBe(false);
      expect(result.refundRequired).toBe(true);

      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.paymentStatus).toBe('paid');
      expect(updatedBooking.fulfillmentStatus).toBe('refund_required');

      const updatedShow = await Show.findById(show._id);
      expect(updatedShow.seats.get('A2').status).toBe('available'); // Was not booked
    });

    it('should retry fulfillment side-effects for paid bookings', async () => {
      const booking = await Booking.create({
        user: userId,
        show: show._id,
        seatsSelected: ['A1'],
        subtotal: 100,
        convenienceFee: 2,
        totalAmount: 102,
        paymentStatus: 'paid',
        fulfillmentStatus: 'fulfilled',
        qrCodeUrl: null, // Simulate failure to generate QR
        lockToken: 'some-token',
      });

      const result = await ensureBookingFulfillment(booking._id);
      expect(result.success).toBe(true);

      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.qrCodeUrl).toBeTruthy();
    });
  });
});
