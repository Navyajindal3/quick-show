const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const Show = require('../models/Show');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const redis = require('../config/redis');
const { releaseOwnedLocks } = require('../utils/redisHelpers');
const { finalizeSuccessfulPayment } = require('../services/paymentService');



/**
 * @desc    Create Razorpay Order & pending booking
 * @route   POST /api/bookings/create-order
 * @access  Private
 */
const createOrder = async (req, res, next) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('❌ Razorpay keys missing in environment variables');
    return res.status(500).json({ success: false, message: 'Payment gateway configuration error' });
  }

  let booking;
  const { showId, seatLabels, lockToken } = req.body;
  
  try {
    const userId = req.user._id;

    if (!lockToken) {
      return res.status(400).json({ success: false, message: 'Lock token is required' });
    }

    // Idempotency check
    try {
      const existingBooking = await Booking.findOne({
        lockToken,
        user: userId,
      });

      if (existingBooking) {
        if (existingBooking.paymentStatus === 'paid' || existingBooking.paymentStatus === 'SUCCESS') {
          return res.status(409).json({ success: false, message: 'Booking is already completed' });
        }
        if (existingBooking.paymentStatus === 'failed') {
          return res.status(409).json({ success: false, message: 'Previous booking attempt failed. Please re-select seats.' });
        }
        if (existingBooking.paymentStatus === 'pending') {
          if (existingBooking.razorpayOrderId) {
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
                currency: 'INR'
              }
            });
          } else {
            booking = existingBooking;
          }
        }
      }
    } catch (err) {
      // ignore or log, proceed to normal flow if not found
    }

    const show = await Show.findById(showId).populate('movie').populate('theatre');
    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }

    // Atomic Redis validation & renewal
    const verifyAndExtendScript = `
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

    const keys = seatLabels.map(label => `lock:show_${showId}:seat_${label}`);
    const scriptResult = await redis.eval(verifyAndExtendScript, keys.length, ...keys, lockToken, 600);

    if (scriptResult === 0) {
      return res.status(409).json({
        success: false,
        message: 'Your seat reservation has expired or is no longer valid.',
      });
    }

    const lockExpiresAt = new Date(Date.now() + 600 * 1000);

    let subtotal = 0;
    for (const label of seatLabels) {
      const seat = show.seats.get(label);
      const price = show.categoryPricing.get(seat.category);
      if (typeof price !== 'number') {
        return res.status(400).json({
          success: false,
          message: `Pricing unavailable for seat ${label}`,
        });
      }
      subtotal += price;
    }

    const convenienceFee = Math.round(subtotal * 0.02);
    const totalAmount = subtotal + convenienceFee;

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
      { _id: booking._id, orderCreationStatus: 'pending' },
      { $set: { orderCreationStatus: 'in_progress' } },
      { new: true }
    );

    if (!updatedBooking) {
      // Re-fetch to see if it was completed by another request
      const existingBooking = await Booking.findById(booking._id);
      if (existingBooking && existingBooking.razorpayOrderId) {
        return res.status(200).json({
          success: true,
          subtotal: existingBooking.subtotal,
          convenienceFee: existingBooking.convenienceFee,
          totalAmount: existingBooking.totalAmount,
          order: { id: existingBooking.razorpayOrderId, amount: existingBooking.totalAmount * 100, currency: 'INR' },
          bookingId: existingBooking._id,
        });
      }
      // If still in_progress, return 202
      return res.status(202).json({
        success: true,
        message: 'Order creation is in progress. Please try again shortly.',
      });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID.trim(),
      key_secret: process.env.RAZORPAY_KEY_SECRET.trim(),
    });

    const options = {
      amount: totalAmount * 100, // Razorpay uses paise
      currency: 'INR',
      receipt: booking._id.toString(),
    };

    const order = await razorpay.orders.create(options);

    updatedBooking.razorpayOrderId = order.id;
    updatedBooking.orderCreationStatus = 'completed';
    await updatedBooking.save();

    res.status(200).json({
      success: true,
      subtotal,
      convenienceFee,
      totalAmount,
      order,
      bookingId: updatedBooking._id,
    });
  } catch (error) {
    console.error('DEBUG ERROR:', error);
    
    // Only release lock if THIS request failed before saving order
    // Check if it's a duplicate key error on lockToken, indicating we lost the creation race
    if (error.code === 11000 && error.keyPattern && error.keyPattern.lockToken) {
      const existingBooking = await Booking.findOne({ lockToken });
      if (existingBooking && existingBooking.razorpayOrderId) {
        return res.status(200).json({
          success: true,
          subtotal: existingBooking.subtotal,
          convenienceFee: existingBooking.convenienceFee,
          totalAmount: existingBooking.totalAmount,
          order: { id: existingBooking.razorpayOrderId, amount: existingBooking.totalAmount * 100, currency: 'INR' },
          bookingId: existingBooking._id,
        });
      }
      return res.status(202).json({
        success: true,
        message: 'Order creation is in progress by another request.',
      });
    }

    if (booking && booking._id) {
      await Booking.updateOne({ _id: booking._id }, { paymentStatus: 'failed', orderCreationStatus: 'pending' });
    }
    
    // Release locks only if we are absolutely sure the booking failed completely
    // For safety, we only release if we successfully created it (not 11000)
    if (error.code !== 11000) {
      await releaseOwnedLocks(showId, seatLabels, lockToken);
    }

    if (error.statusCode === 401) {
      error.statusCode = 500;
      error.message = 'Payment Gateway Configuration Error: Invalid API Keys';
    }
    next(error);
  }
};

/**
 * @desc    Verify Razorpay Payment
 * @route   POST /api/bookings/verify-payment
 * @access  Private
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You cannot verify this booking' });
    }

    if (booking.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Order ID does not match this booking' });
    }

    if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'SUCCESS') {
      if (booking.razorpayPaymentId && booking.razorpayPaymentId !== razorpay_payment_id) {
        return res.status(409).json({ success: false, message: 'Booking was already processed using another payment' });
      }
      return res.status(200).json({ success: true, alreadyProcessed: true, message: 'Payment was already verified' });
    }

    const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    const body = String(booking.razorpayOrderId) + '|' + String(razorpay_payment_id);
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const result = await finalizeSuccessfulPayment({ bookingId, razorpayPaymentId: razorpay_payment_id });

    if (!result || (result.processedNow === false && !result.alreadyProcessed)) {
      return res.status(400).json({ success: false, message: 'Payment finalization failed' });
    }

    res.status(200).json({ success: true, message: 'Payment verified successfully' });
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
 * @desc    Get a single booking by ID (for booking success page)
 * @route   GET /api/bookings/:id
 * @access  Private
 */
const getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      user: req.user._id, // Security: users can only see their own bookings
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
 * @desc    Get ticket details before verification
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
      decoded = jwt.verify(token, process.env.TICKET_JWT_SECRET, {
        issuer: 'quickshow',
        audience: 'theatre-admin'
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
      paymentStatus: 'paid'
    }).populate('user', 'name email').populate({
      path: 'show',
      populate: [
        { path: 'movie', select: 'title' },
        { path: 'theatre', select: 'name' }
      ]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Ticket not found or unpaid' });
    }

    res.status(200).json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify and mark a ticket as scanned
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
      decoded = jwt.verify(token, process.env.TICKET_JWT_SECRET, {
        issuer: 'quickshow',
        audience: 'theatre-admin'
      });
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired ticket token' });
    }

    if (decoded.type !== 'movie-ticket') {
       return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const bookingId = decoded.bookingId;

    const booking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
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
    ).populate('user', 'name email').populate({
      path: 'show',
      populate: [
        { path: 'movie', select: 'title' },
        { path: 'theatre', select: 'name' },
      ],
    });

    if (!booking) {
      const checkBooking = await Booking.findById(bookingId);
      if (checkBooking && checkBooking.isScanned) {
         return res.status(409).json({ success: false, message: 'Ticket has already been scanned' });
      }
      return res.status(400).json({ success: false, message: 'Ticket not found or unpaid' });
    }

    res.status(200).json({
      success: true,
      message: 'Ticket successfully verified.',
      booking,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Razorpay Webhook for Payment Resilience
 * @route   POST /api/webhook/razorpay
 * @access  Public
 */
const razorpayWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();

    if (!secret || !signature) {
      return res.status(400).send('Missing signature or secret');
    }

    // Verify signature using raw body
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error('Invalid Razorpay Webhook Signature');
      return res.status(400).send('Invalid signature');
    }

    const payload = JSON.parse(req.body.toString());

    if (payload.event === 'payment.captured') {
      const paymentEntity = payload.payload.payment.entity;
      const order_id = paymentEntity.order_id;

      const booking = await Booking.findOne({ razorpayOrderId: order_id });

      if (!booking) {
        return res.status(404).send('Booking not found');
      }

      await finalizeSuccessfulPayment({ bookingId: booking._id, razorpayPaymentId: paymentEntity.id });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook Error');
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getMyBookings,
  getBookingById,
  getAllBookingsAdmin,
  verifyTicket,
  getTicketDetails,
  razorpayWebhook,
};
