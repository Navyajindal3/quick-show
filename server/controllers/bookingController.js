const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const Show = require('../models/Show');
const User = require('../models/User');
const generateQRCode = require('../utils/generateQR');
const { sendBookingConfirmationEmail } = require('../utils/sendEmail');

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

    // Verify all selected seats are 'locked' (by any user, as frontend locked them)
    const unavailableSeats = seatLabels.filter(
      (label) => show.seats.get(label) !== 'locked'
    );
    if (unavailableSeats.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Seats ${unavailableSeats.join(', ')} are not locked. Please re-select your seats.`,
      });
    }

    const totalAmount = seatLabels.length * show.ticketPrice;

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
        ticketPrice: show.ticketPrice,
      },
    });

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
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

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // 1. Find and update the booking to 'paid'
      const booking = await Booking.findById(bookingId).populate({
        path: 'user',
        select: 'name email',
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }

      // 2. Generate QR code for this booking
      const qrCodeDataUrl = await generateQRCode(bookingId);

      // 3. Mark seats as permanently 'booked' in the Show document
      const seatUpdates = {};
      booking.seatsSelected.forEach((label) => {
        seatUpdates[`seats.${label}`] = 'booked';
      });

      await Show.findByIdAndUpdate(booking.show, {
        $set: seatUpdates,
        // Remove lock entries for these seats
        $pull: {
          lockedSeats: { userId: booking.user._id },
        },
      });

      // 4. Update booking record
      booking.paymentStatus = 'paid';
      booking.razorpayPaymentId = razorpay_payment_id;
      booking.qrCodeUrl = qrCodeDataUrl;
      await booking.save();

      // 5. Send confirmation email (non-blocking)
      if (booking.user && booking.user.email) {
        sendBookingConfirmationEmail({
          to: booking.user.email,
          userName: booking.user.name,
          booking,
          qrCodeDataUrl,
        });
      }

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

module.exports = {
  createOrder,
  verifyPayment,
  getMyBookings,
  getBookingById,
  getAllBookingsAdmin,
};
