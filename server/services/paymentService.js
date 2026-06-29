const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Show = require('../models/Show');
const redis = require('../config/redis');
const generateQRCode = require('../utils/generateQR');
const { sendTicketEmail } = require('../utils/sendEmail');
const { releaseOwnedLocks } = require('../utils/redisHelpers');

const finalizeSuccessfulPayment = async ({ bookingId, razorpayPaymentId }) => {
  const session = await mongoose.startSession();
  let result = null;

  try {
    await session.withTransaction(async () => {
      // 1. Find the Booking only if it is still pending
      const booking = await Booking.findOne({
        _id: bookingId,
        paymentStatus: 'pending',
      }).populate('user', 'name email').session(session);

      if (!booking) {
        // Booking might already be paid or failed
        const existingBooking = await Booking.findById(bookingId).populate('user', 'name email').session(session);
        if (existingBooking && (existingBooking.paymentStatus === 'paid' || existingBooking.paymentStatus === 'SUCCESS')) {
          result = { booking: existingBooking, processedNow: false, alreadyProcessed: true };
          return;
        }
        throw new Error('Booking not found or in invalid state');
      }

      // 2. Validate Razorpay order ID (already validated in controller, but good to be safe)

      // 2.5 Verify booking.lockToken ownership in Redis immediately before payment finalization
      let locksValid = true;
      if (booking.lockToken) {
        for (const seatLabel of booking.seatsSelected) {
          const lockKey = `lock:show_${booking.show}:seat_${seatLabel}`;
          const currentToken = await redis.get(lockKey);
          if (currentToken !== booking.lockToken) {
            locksValid = false;
            break;
          }
        }
      }

      if (!locksValid) {
        // Payment succeeded after lock ownership was lost (e.g., late webhook)
        booking.paymentStatus = 'paid';
        booking.fulfillmentStatus = 'refund_required';
        booking.razorpayPaymentId = razorpayPaymentId;
        await booking.save({ session });
        result = { booking, processedNow: false, refundRequired: true };
        return;
      }
      
      // 3. Build a conditional Show query requiring all selected seats to still be available
      const showFilter = { _id: booking.show };
      booking.seatsSelected.forEach((seatLabel) => {
        showFilter[`seats.${seatLabel}.status`] = { $ne: 'booked' }; // must not be permanently booked by someone else
      });

      // 4. Atomically update all selected seat statuses to booked
      const seatUpdates = {};
      booking.seatsSelected.forEach((seatLabel) => {
        seatUpdates[`seats.${seatLabel}.status`] = 'booked';
      });

      const updatedShow = await Show.findOneAndUpdate(
        showFilter,
        {
          $set: seatUpdates,
          $pull: {
            lockedSeats: { userId: booking.user._id }, // cleanup legacy locks if any
          },
        },
        { session, new: true }
      );

      if (!updatedShow) {
        throw new Error('One or more seats are no longer available');
      }

      // 5. Atomically transition the Booking from pending to paid and fulfilled
      booking.paymentStatus = 'paid';
      booking.fulfillmentStatus = 'fulfilled';
      booking.razorpayPaymentId = razorpayPaymentId;
      await booking.save({ session });

      result = { booking, processedNow: true };
    });

    if (result && result.processedNow) {
      const booking = result.booking;
      
      // 1. Generate QR Code
      if (!booking.qrCodeUrl) {
        booking.qrCodeUrl = await generateQRCode(booking._id, booking.user._id);
        await booking.save();
      }

      // 2. Redis Cleanup
      await releaseOwnedLocks(booking.show, booking.seatsSelected, booking.lockToken);

      // 3. Send Email
      if (booking.user && booking.user.email) {
        const emailParams = {
          userName: booking.user.name,
          movieName: booking.bookingSnapshot?.movieTitle,
          theatreName: booking.bookingSnapshot?.theatreName,
          showTime: booking.bookingSnapshot?.showTime ? new Date(booking.bookingSnapshot.showTime).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'N/A',
          screenName: booking.bookingSnapshot?.screenNumber,
          seatsList: booking.seatsSelected?.join(', '),
          amountPaid: booking.totalAmount,
          bookingId: booking._id,
          qrCodeUrl: booking.qrCodeUrl,
          userId: booking.user._id
        };
        sendTicketEmail(booking.user.email, emailParams);
      }
    } else if (result && result.refundRequired) {
      console.warn(`Payment succeeded but lock lost for booking ${result.booking._id}. Refund required.`);
    }

    return result;
  } catch (error) {
    throw error;
  } finally {
    session.endSession();
  }
};

const ensureBookingFulfillment = async (bookingId) => {
  const booking = await Booking.findById(bookingId).populate('user', 'name email');
  if (!booking) throw new Error('Booking not found');

  if (booking.paymentStatus === 'paid' && booking.fulfillmentStatus === 'fulfilled') {
    if (!booking.qrCodeUrl) {
      booking.qrCodeUrl = await generateQRCode(booking._id, booking.user._id);
      await booking.save();
    }
    await releaseOwnedLocks(booking.show, booking.seatsSelected, booking.lockToken);
    return { success: true, message: 'Fulfillment side-effects ensured' };
  }
  return { success: false, message: 'Booking not eligible for fulfillment side-effects' };
};

module.exports = {
  finalizeSuccessfulPayment,
  ensureBookingFulfillment,
};
