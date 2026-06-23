const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const Show = require('../models/Show');
const User = require('../models/User');
const generateQRCode = require('../utils/generateQR');

const redis = require('../config/redis');

/**
 * @desc    Create Razorpay Order & pending booking
 * @route   POST /api/bookings/create-order
 * @access  Private
 */
const createOrder = async (req, res, next) => {
  try {
    const { showId, seatLabels } = req.body;
    const userId = req.user._id;

    const show = await Show.findById(showId).populate('movie').populate('theatre');
    if (!show) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }

    // Attempt to lock all seats in Redis
    const lockedKeys = [];
    let conflict = false;

    for (const label of seatLabels) {
      const lockKey = `lock:show_${showId}:seat_${label}`;
      const seat = show.seats.get(label);
      if (!seat || seat.status === 'booked') {
        conflict = true;
        break;
      }

      // Try to acquire Redis lock for 10 minutes (600 seconds)
      const acquired = await redis.set(lockKey, userId.toString(), 'EX', 600, 'NX');
      if (!acquired) {
        conflict = true;
        break;
      }
      lockedKeys.push(lockKey);
    }

    if (conflict) {
      // Rollback any locks we just acquired
      if (lockedKeys.length > 0) {
        await redis.del(...lockedKeys);
      }
      return res.status(409).json({
        success: false,
        message: 'One or more seats are already reserved. Please select different seats.',
      });
    }

    // Calculate total amount based on seat categories
    let totalAmount = 0;
    seatLabels.forEach((label) => {
      const seat = show.seats.get(label);
      totalAmount += show.categoryPricing.get(seat.category);
    });

    // Create a pending booking document first
    const booking = await Booking.create({
      user: userId,
      show: showId,
      seatsSelected: seatLabels,
      totalAmount,
      paymentStatus: 'pending',
      bookingSnapshot: {
        movieTitle: show.movie.title,
        theatreName: show.theatre.name,
        showTime: show.showTime,
        screenNumber: show.screenNumber,
      },
    });

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('❌ Razorpay keys missing in environment variables');
      return res.status(500).json({ success: false, message: 'Payment gateway configuration error' });
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

    // Save razorpay order ID to booking
    booking.razorpayOrderId = order.id;
    await booking.save();

    res.status(200).json({
      success: true,
      order,
      bookingId: booking._id,
    });
  } catch (error) {
    // If Razorpay throws a 401 (Invalid API keys), don't bubble it up as 401.
    // A 401 response tells the frontend that the USER's session is expired, which logs them out.
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

    // Detailed logging for debugging signature mismatch
    console.log('--- Razorpay Payment Verification ---');
    console.log('Payload Received:', { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId });
    
    const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    console.log('Secret Key Prefix:', secret.substring(0, 4) + '...');

    // Strict string casting as per Razorpay docs
    const body = String(razorpay_order_id) + '|' + String(razorpay_payment_id);
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    console.log('Expected Signature:', expectedSignature);
    console.log('Received Signature:', razorpay_signature);
    console.log('Is Authentic?', expectedSignature === razorpay_signature);
    console.log('---------------------------------------');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      console.log('--- Signature Verified Successfully ---');
      console.log('Searching for booking with ID:', bookingId);
      
      // 1. Find and update the booking to 'paid'
      const booking = await Booking.findById(bookingId).populate({
        path: 'user',
        select: 'name email',
      });

      console.log('Booking found in DB?', booking ? 'YES' : 'NO');

      if (!booking) {
        console.error('❌ BOOKING NOT FOUND IN DB! ID:', bookingId);
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }

      console.log('Generating QR Code for booking...');
      // 2. Generate QR code for this booking
      const qrCodeDataUrl = await generateQRCode(bookingId, booking.user._id);

      console.log('Marking seats as booked in Show ID:', booking.show);
      // 3. Mark seats as permanently 'booked' in the Show document
      const seatUpdates = {};
      booking.seatsSelected.forEach((label) => {
        seatUpdates[`seats.${label}.status`] = 'booked';
      });

      try {
        console.log('Seat updates:', seatUpdates);
        console.log('Pulling locks for user ID:', booking.user ? booking.user._id : 'USER IS NULL');
        
        await Show.findByIdAndUpdate(booking.show, {
          $set: seatUpdates,
          // Remove lock entries for these seats
          $pull: {
            lockedSeats: { userId: booking.user._id },
          },
        });
        console.log('Show updated successfully!');
      } catch (err) {
        console.error('❌ CRASH IN Show.findByIdAndUpdate:', err.name, err.message);
        console.error(err.stack);
        return res.status(500).json({ success: false, message: 'Crash while updating Show: ' + err.message });
      }

      console.log('Updating booking status and payment ID...');
      // 4. Update booking record
      booking.paymentStatus = 'paid';
      booking.razorpayPaymentId = razorpay_payment_id;
      booking.qrCodeUrl = qrCodeDataUrl;
      await booking.save();



      console.log('✅ Payment Verification Complete! Sending 200 OK.');
      res.status(200).json({ success: true, message: 'Payment verified successfully' });
    } else {
      // Handle payment verification failure
      await Booking.findByIdAndUpdate(bookingId, { paymentStatus: 'failed' });

      // Release locked seats
      const booking = await Booking.findById(bookingId);
      if (booking) {
        const seatUpdates = {};
        booking.seatsSelected.forEach((label) => {
          seatUpdates[`seats.${label}`] = 'available';
        });
        await Show.findByIdAndUpdate(booking.show, { $set: seatUpdates });
      }

      res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }
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
 * @desc    Verify and mark a ticket as scanned
 * @route   PUT /api/bookings/verify/:id
 * @access  Private/Admin
 */
const verifyTicket = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('user', 'name email')
      .populate({
        path: 'show',
        populate: [
          { path: 'movie', select: 'title' },
          { path: 'theatre', select: 'name' },
        ],
      });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.isScanned) {
      return res.status(400).json({ success: false, message: 'Ticket has already been scanned and used.' });
    }

    booking.isScanned = true;
    await booking.save();

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

      const booking = await Booking.findOne({ razorpayOrderId: order_id }).populate({
        path: 'user',
        select: 'name email',
      });

      if (!booking) {
        return res.status(404).send('Booking not found');
      }

      // Idempotency check
      if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'SUCCESS') {
        return res.status(200).send('Already processed');
      }

      booking.paymentStatus = 'paid';
      booking.razorpayPaymentId = paymentEntity.id;

      // Start transaction
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Generate QR Code
        const qrCodeDataUrl = await generateQRCode(booking._id, booking.user._id);
        booking.qrCodeUrl = qrCodeDataUrl;
        await booking.save({ session });

        // Mark seats as permanently booked and delete Redis locks
        const seatUpdates = {};
        const redisKeysToDelete = [];
        booking.seatsSelected.forEach((label) => {
          seatUpdates[`seats.${label}.status`] = 'booked';
          redisKeysToDelete.push(`lock:show_${booking.show}:seat_${label}`);
        });

        await Show.findByIdAndUpdate(
          booking.show,
          {
            $set: seatUpdates,
            $pull: {
              lockedSeats: { userId: booking.user._id }, // Clean up legacy MongoDB locks if any
            },
          },
          { session, new: true }
        );

        await session.commitTransaction();

        if (redisKeysToDelete.length > 0) {
          await redis.del(...redisKeysToDelete);
        }


      } catch (txnError) {
        await session.abortTransaction();
        throw txnError;
      } finally {
        session.endSession();
      }
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
  razorpayWebhook,
};
