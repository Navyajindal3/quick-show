'use strict';

/**
 * Booking Controller
 * ==================
 * Handles booking creation, payment verification, webhook processing,
 * ticket management, and admin operations.
 *
 * Security guarantees:
 *   - Prices are ALWAYS computed server-side from show data
 *   - Seat availability is ALWAYS validated server-side
 *   - Lock ownership is validated via Redis Lua script
 *   - Payment signature is verified with server-side secret
 *   - Webhook signature is verified against raw request body
 *   - All state transitions are idempotent
 *   - No secrets are logged
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const FulfillmentJob = require('../models/FulfillmentJob');
const Show = require('../models/Show');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { verifyLockOwnership, releaseOwnedLocks } = require('../utils/redisHelpers');
const { finalizeSuccessfulPayment, retryFulfillment, retryRefund } = require('../services/paymentService');

// ─── Razorpay signature verification (shared logic) ───────────────────────────

/**
 * Verify Razorpay payment signature.
 * @param {string} orderId
 * @param {string} paymentId
 * @param {string} signature
 * @returns {boolean}
 */
const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  const secret = config.RAZORPAY_KEY_SECRET.trim();
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
};

/**
 * Verify Razorpay webhook signature using raw body.
 * @param {Buffer} rawBody
 * @param {string} signature
 * @returns {boolean}
 */
const verifyWebhookSignature = (rawBody, signature) => {
  const secret = config.RAZORPAY_WEBHOOK_SECRET.trim();
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === signature;
};


/**
 * @desc    Create Razorpay Order & pending booking
 * @route   POST /api/bookings/create-order
 * @access  Private
 */
const createOrder = async (req, res, next) => {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ success: false, message: 'Payment gateway configuration error' });
  }

  let booking;
  const { showId, seatLabels, lockToken } = req.body;

  try {
    const userId = req.user._id;

    if (!lockToken) {
      return res.status(400).json({ success: false, message: 'Lock token is required' });
    }

    if (!Array.isArray(seatLabels) || seatLabels.length === 0) {
      return res.status(400).json({ success: false, message: 'Seat labels are required' });
    }

    if (seatLabels.length > config.MAX_SEATS_PER_BOOKING) {
      return res.status(400).json({
        success: false,
        message: `Cannot book more than ${config.MAX_SEATS_PER_BOOKING} seats`,
      });
    }

    // Idempotency check — return existing pending order if already created
    const existingBooking = await Booking.findOne({ lockToken, user: userId });
    if (existingBooking) {
      if (existingBooking.paymentStatus === 'paid') {
        return res.status(409).json({ success: false, message: 'Booking is already completed' });
      }
      if (existingBooking.paymentStatus === 'failed') {
        return res.status(409).json({
          success: false,
          message: 'Previous booking attempt failed. Please re-select seats.',
        });
      }
      if (existingBooking.paymentStatus === 'pending' && existingBooking.razorpayOrderId) {
        return res.status(200).json({
          success: true,
          alreadyCreated: true,
          bookingId: existingBooking._id,
          subtotal: existingBooking.subtotal,
          convenienceFee: existingBooking.convenienceFee,
          totalAmount: existingBooking.totalAmount,
          order: {
            id: existingBooking.razorpayOrderId,
            amount: existingBooking.totalAmount * 100,
            currency: 'INR',
          },
        });
      }
      if (existingBooking.paymentStatus === 'pending') {
        booking = existingBooking;
      }
    }

    const show = await Show.findById(showId).populate('movie').populate('theatre');
    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }

    if (!show.isActive || show.showTime <= new Date()) {
      return res.status(400).json({ success: false, message: 'Show is no longer available' });
    }

    // ── Verify lock ownership via atomic Lua script ────────────────────────
    const locksValid = await verifyLockOwnership(showId, seatLabels, lockToken, 600);

    if (!locksValid) {
      return res.status(409).json({
        success: false,
        message: 'Your seat reservation has expired or is no longer valid.',
      });
    }

    // ── Compute price server-side (NEVER trust frontend prices) ───────────
    let subtotal = 0;
    for (const label of seatLabels) {
      const seat = show.seats.get(label);
      if (!seat) {
        return res.status(400).json({
          success: false,
          message: `Seat ${label} does not exist in this show`,
        });
      }
      const price = show.categoryPricing.get(seat.category);
      if (typeof price !== 'number') {
        return res.status(400).json({
          success: false,
          message: `Pricing unavailable for seat category '${seat.category}'`,
        });
      }
      subtotal += price;
    }

    const convenienceFee = Math.round(subtotal * 0.02);
    const totalAmount = subtotal + convenienceFee;

    const lockExpiresAt = new Date(Date.now() + 600 * 1000);

    if (!booking) {
      booking = await Booking.create({
        user: userId,
        show: showId,
        seatsSelected: seatLabels,
        subtotal,
        convenienceFee,
        totalAmount,
        paymentStatus: 'pending',
        orderCreationStatus: 'pending',
        lockToken,
        lockExpiresAt,
        bookingSnapshot: {
          movieTitle: show.movie.title,
          theatreName: show.theatre.name,
          showTime: show.showTime,
          screenNumber: show.screenNumber,
        },
      });
    }

    // Atomic update to acquire order creation lock
    const updatedBooking = await Booking.findOneAndUpdate(
      { _id: booking._id, orderCreationStatus: { $in: ['pending', 'failed'] } },
      {
        $set: {
          orderCreationStatus: 'in_progress',
          orderCreationStartedAt: new Date(),
          orderCreationAttemptId: Date.now().toString(),
        },
      },
      { new: true }
    );

    if (!updatedBooking) {
      const existingB = await Booking.findById(booking._id);
      if (existingB && existingB.razorpayOrderId) {
        return res.status(200).json({
          success: true,
          subtotal: existingB.subtotal,
          convenienceFee: existingB.convenienceFee,
          totalAmount: existingB.totalAmount,
          order: { id: existingB.razorpayOrderId, amount: existingB.totalAmount * 100, currency: 'INR' },
          bookingId: existingB._id,
        });
      }
      return res.status(202).json({
        success: true,
        message: 'Order creation is in progress. Please try again shortly.',
      });
    }

    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID.trim(),
      key_secret: config.RAZORPAY_KEY_SECRET.trim(),
    });

    const order = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: 'INR',
      receipt: booking._id.toString(),
    });

    updatedBooking.razorpayOrderId = order.id;
    updatedBooking.orderCreationStatus = 'completed';
    await updatedBooking.save();

    return res.status(200).json({
      success: true,
      subtotal,
      convenienceFee,
      totalAmount,
      order,
      bookingId: updatedBooking._id,
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.lockToken) {
      const existing = await Booking.findOne({ lockToken });
      if (existing && existing.razorpayOrderId) {
        return res.status(200).json({
          success: true,
          subtotal: existing.subtotal,
          convenienceFee: existing.convenienceFee,
          totalAmount: existing.totalAmount,
          order: { id: existing.razorpayOrderId, amount: existing.totalAmount * 100, currency: 'INR' },
          bookingId: existing._id,
        });
      }
      return res.status(202).json({
        success: true,
        message: 'Order creation is in progress by another request.',
      });
    }

    if (booking && booking._id) {
      await Booking.updateOne(
        { _id: booking._id },
        { paymentStatus: 'failed', orderCreationStatus: 'failed', orderCreationError: 'Order creation failed' }
      ).catch(() => {});
      await releaseOwnedLocks(showId, seatLabels, lockToken).catch(() => {});
    }

    // Mask Razorpay auth errors
    if (error.statusCode === 401) {
      error.statusCode = 500;
      error.message = 'Payment gateway configuration error';
    }
    next(error);
  }
};

/**
 * @desc    Verify Razorpay Payment (frontend callback)
 * @route   POST /api/bookings/verify-payment
 * @access  Private
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
      return res.status(400).json({ success: false, message: 'Missing required payment parameters' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Authorization: user can only verify their own booking
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You cannot verify this booking' });
    }

    // Validate order ID matches booking
    if (booking.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Order ID does not match this booking' });
    }

    // Idempotency — already paid
    if (booking.paymentStatus === 'paid') {
      if (booking.razorpayPaymentId && booking.razorpayPaymentId !== razorpay_payment_id) {
        return res.status(409).json({
          success: false,
          message: 'Booking was already processed using a different payment',
        });
      }
      return res.status(200).json({
        success: true,
        alreadyProcessed: true,
        message: 'Payment was already verified',
      });
    }

    // Verify signature — uses server-side secret only
    if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const result = await finalizeSuccessfulPayment({
      bookingId,
      razorpayPaymentId: razorpay_payment_id,
    });

    if (!result) {
      return res.status(400).json({ success: false, message: 'Payment finalization failed' });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      refundRequired: result.refundRequired || false,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all bookings for the logged-in user
 * @route   GET /api/bookings/my-bookings
 * @access  Private
 */
const getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: 'show',
        populate: [
          { path: 'movie', select: 'title posterUrl duration language' },
          { path: 'theatre', select: 'name location' },
        ],
      });

    res.status(200).json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single booking by ID
 * @route   GET /api/bookings/:id
 * @access  Private
 */
const getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate({
      path: 'show',
      populate: [
        { path: 'movie', select: 'title posterUrl duration language genre' },
        { path: 'theatre', select: 'name location' },
      ],
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    res.status(200).json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all bookings (admin)
 * @route   GET /api/bookings/admin/all
 * @access  Private/Admin
 */
const getAllBookingsAdmin = async (req, res, next) => {
  try {
    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate({
        path: 'show',
        populate: [
          { path: 'movie', select: 'title' },
          { path: 'theatre', select: 'name' },
        ],
      });

    res.status(200).json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get admin dashboard — problematic bookings
 * @route   GET /api/bookings/admin/issues
 * @access  Private/Admin
 */
const getAdminIssues = async (req, res, next) => {
  try {
    const [failedEmails, pendingRefunds, failedJobs] = await Promise.all([
      Booking.find({ paymentStatus: 'paid', emailStatus: { $in: ['failed', 'pending'] } })
        .select('_id bookingSnapshot seatsSelected totalAmount emailStatus createdAt user')
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(50),

      Booking.find({ fulfillmentStatus: 'refund_required', refundStatus: { $ne: 'processed' } })
        .select('_id bookingSnapshot totalAmount refundStatus refundFailureReason createdAt user razorpayPaymentId')
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(50),

      FulfillmentJob.find({ status: 'failed' })
        .select('_id type bookingId lastError attemptCount updatedAt')
        .sort({ updatedAt: -1 })
        .limit(50),
    ]);

    res.status(200).json({
      success: true,
      failedEmails,
      pendingRefunds,
      failedJobs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Admin: retry ticket email for a booking
 * @route   POST /api/bookings/admin/:id/retry-email
 * @access  Private/Admin
 */
const adminRetryEmail = async (req, res, next) => {
  try {
    const result = await retryFulfillment(req.params.id);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Admin: retry refund for a booking
 * @route   POST /api/bookings/admin/:id/retry-refund
 * @access  Private/Admin
 */
const adminRetryRefund = async (req, res, next) => {
  try {
    const result = await retryRefund(req.params.id);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get ticket details before verification (preview)
 * @route   GET /api/bookings/ticket-details?token=...
 * @access  Private/Admin
 */
const getTicketDetails = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.TICKET_JWT_SECRET, {
        issuer: 'quickshow',
        audience: 'theatre-admin',
      });
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired ticket token' });
    }

    if (decoded.type !== 'movie-ticket') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const booking = await Booking.findOne({
      _id: decoded.bookingId,
      user: decoded.userId,
      paymentStatus: 'paid',
    })
      .populate('user', 'name email')
      .populate({
        path: 'show',
        populate: [
          { path: 'movie', select: 'title' },
          { path: 'theatre', select: 'name' },
        ],
      });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Ticket not found or not paid' });
    }

    // Don't expose full user profile or sensitive fields
    const safeBooking = {
      _id: booking._id,
      seatsSelected: booking.seatsSelected,
      totalAmount: booking.totalAmount,
      isScanned: booking.isScanned,
      scannedAt: booking.scannedAt,
      bookingSnapshot: booking.bookingSnapshot,
      show: booking.show,
      user: { name: booking.user.name },
    };

    res.status(200).json({ success: true, booking: safeBooking });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify and mark a ticket as scanned (atomic, replay-safe)
 * @route   PUT /api/bookings/verify-ticket
 * @access  Private/Admin
 */
const verifyTicket = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.TICKET_JWT_SECRET, {
        issuer: 'quickshow',
        audience: 'theatre-admin',
      });
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired ticket token' });
    }

    if (decoded.type !== 'movie-ticket') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    // Atomic find-and-update: only succeeds if booking is paid AND not yet scanned
    const booking = await Booking.findOneAndUpdate(
      {
        _id: decoded.bookingId,
        user: decoded.userId,
        paymentStatus: 'paid',
        isScanned: false,
      },
      {
        $set: {
          isScanned: true,
          scannedAt: new Date(),
          scannedBy: req.user._id,
        },
      },
      { new: true }
    )
      .populate('user', 'name email')
      .populate({
        path: 'show',
        populate: [
          { path: 'movie', select: 'title' },
          { path: 'theatre', select: 'name' },
        ],
      });

    if (!booking) {
      // Check if already scanned
      const check = await Booking.findById(decoded.bookingId);
      if (check && check.isScanned) {
        return res.status(409).json({ success: false, message: 'Ticket has already been scanned' });
      }
      return res.status(400).json({ success: false, message: 'Ticket not found or not paid' });
    }

    res.status(200).json({
      success: true,
      message: 'Ticket successfully verified.',
      booking: {
        _id: booking._id,
        seatsSelected: booking.seatsSelected,
        bookingSnapshot: booking.bookingSnapshot,
        isScanned: booking.isScanned,
        scannedAt: booking.scannedAt,
        user: { name: booking.user.name },
        show: booking.show,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Razorpay Webhook
 * @route   POST /api/webhook/razorpay
 * @access  Public (verified by signature)
 */
const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = config.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret || !signature) {
      return res.status(400).send('Missing signature or webhook secret');
    }

    if (!verifyWebhookSignature(req.body, signature)) {
      console.warn('[webhook] Invalid Razorpay webhook signature received');
      return res.status(400).send('Invalid signature');
    }

    const payload = JSON.parse(req.body.toString());
    const eventType = payload.event;
    const eventId = payload.event_id; // Razorpay webhook event ID for dedup

    console.log(`[webhook] Received event: ${eventType} | eventId: ${eventId || 'unknown'}`);

    if (eventType === 'payment.captured') {
      const paymentEntity = payload.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      const booking = await Booking.findOne({ razorpayOrderId: orderId });

      if (!booking) {
        console.warn(`[webhook] No booking found for order ${orderId}`);
        return res.status(200).send('OK'); // Return 200 so Razorpay doesn't retry
      }

      // Idempotent: already processed
      if (booking.paymentStatus === 'paid') {
        console.log(`[webhook] Booking ${booking._id} already paid, ignoring duplicate event`);
        return res.status(200).send('OK');
      }

      await finalizeSuccessfulPayment({
        bookingId: booking._id,
        razorpayPaymentId: paymentId,
      });

      console.log(`[webhook] ✅ Payment finalized for booking ${booking._id}`);
    } else if (eventType === 'refund.created') {
      const refundEntity = payload.payload.refund.entity;
      await Booking.updateOne(
        { razorpayPaymentId: refundEntity.payment_id },
        { $set: { refundStatus: 'pending', refundId: refundEntity.id } }
      );
    } else if (eventType === 'refund.processed') {
      const refundEntity = payload.payload.refund.entity;
      await Booking.updateOne(
        { razorpayPaymentId: refundEntity.payment_id },
        {
          $set: {
            refundStatus: 'processed',
            refundId: refundEntity.id,
            refundProcessedAt: new Date(),
            paymentStatus: 'refunded',
          },
        }
      );
      console.log(`[webhook] ✅ Refund processed for payment ${refundEntity.payment_id}`);
    } else if (eventType === 'refund.failed') {
      const refundEntity = payload.payload.refund.entity;
      await Booking.updateOne(
        { razorpayPaymentId: refundEntity.payment_id },
        {
          $set: {
            refundStatus: 'failed',
            refundId: refundEntity.id,
            refundFailureReason: 'Razorpay reported refund failure',
            paymentStatus: 'refund_failed',
          },
        }
      );
      console.warn(`[webhook] ❌ Refund failed for payment ${refundEntity.payment_id}`);
    }

    return res.status(200).send('OK');
  } catch (error) {
    // Always return 200 to prevent Razorpay from retrying indefinitely
    // for errors that are our fault (e.g. DB error). Log the error for investigation.
    console.error('[webhook] Error processing webhook:', error.message);
    return res.status(200).send('OK');
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getMyBookings,
  getBookingById,
  getAllBookingsAdmin,
  getAdminIssues,
  adminRetryEmail,
  adminRetryRefund,
  verifyTicket,
  getTicketDetails,
  razorpayWebhook,
};
