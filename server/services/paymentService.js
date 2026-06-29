const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Show = require('../models/Show');
const redis = require('../config/redis');
const { sendTicketEmail } = require('../utils/sendEmail');
const { generateTicketToken, generateQRCode } = require('../utils/generateQR');
const Razorpay = require('razorpay');
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
      // Use an atomic Lua script to verify all locks simultaneously and extend them briefly 
      // (fencing) to ensure they don't expire mid-transaction.
      let locksValid = true;
      if (booking.lockToken && booking.seatsSelected.length > 0) {
        const verifyScript = `
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
        const keys = booking.seatsSelected.map(label => `lock:show_${booking.show}:seat_${label}`);
        try {
          const result = await redis.eval(verifyScript, keys.length, ...keys, booking.lockToken, 60); // brief 60s extension
          if (result === 0) locksValid = false;
        } catch (err) {
          console.error("Lock verification script failed", err);
          locksValid = false;
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
      await ensureBookingFulfillment(result.booking._id);
    } else if (result && result.refundRequired) {
      console.warn(`Payment succeeded but lock lost for booking ${result.booking._id}. Initiating refund...`);
      
      try {
        const razorpay = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID.trim(),
          key_secret: process.env.RAZORPAY_KEY_SECRET.trim(),
        });
        
        await Booking.updateOne({ _id: result.booking._id }, { refundStatus: 'pending' });
        
        const refund = await razorpay.payments.refund(razorpayPaymentId, {
          amount: result.booking.totalAmount * 100,
          speed: 'optimum'
        });
        
        await Booking.updateOne(
          { _id: result.booking._id }, 
          { refundStatus: 'completed', refundId: refund.id }
        );
        console.log(`✅ Refund successful for booking ${result.booking._id}. Refund ID: ${refund.id}`);
      } catch (refundError) {
        console.error(`❌ Refund failed for booking ${result.booking._id}. Admin intervention required.`, refundError);
        await Booking.updateOne(
          { _id: result.booking._id }, 
          { refundStatus: 'failed' }
        );
      }
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

  if (booking.paymentStatus === 'paid' && booking.fulfillmentStatus !== 'refund_required') {
    let updated = false;

    // 1. Generate QR Code
    if (!booking.qrGeneratedAt) {
      booking.qrCodeUrl = await generateQRCode(booking._id, booking.user._id);
      booking.qrGeneratedAt = new Date();
      updated = true;
    }

    // 2. Send Email
    if (!booking.confirmationEmailSentAt && booking.user && booking.user.email) {
      const ticketToken = generateTicketToken(booking._id, booking.user._id);
      
      const emailParams = {
        userName: booking.user.name,
        movieName: booking.bookingSnapshot?.movieTitle,
        theatreName: booking.bookingSnapshot?.theatreName,
        showTime: booking.bookingSnapshot?.showTime ? new Date(booking.bookingSnapshot.showTime).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'N/A',
        screenName: booking.bookingSnapshot?.screenNumber,
        seatsList: booking.seatsSelected?.join(', '),
        amountPaid: booking.totalAmount,
        bookingId: booking._id,
        ticketToken, // pass the secure token to email generator
        userId: booking.user._id
      };
      
      try {
        await sendTicketEmail(booking.user.email, emailParams);
        booking.confirmationEmailSentAt = new Date();
        updated = true;
      } catch (err) {
        console.error('Failed to send confirmation email', err);
        // Do not throw, allow retry later
      }
    }

    if (booking.qrGeneratedAt && booking.confirmationEmailSentAt) {
      booking.fulfillmentStatus = 'fulfilled';
      updated = true;
    }

    if (updated) {
      await booking.save();
    }

    await releaseOwnedLocks(booking.show, booking.seatsSelected, booking.lockToken);
    return { success: true, message: 'Fulfillment side-effects completed' };
  }
  return { success: false, message: 'Booking not eligible for fulfillment side-effects' };
};

module.exports = {
  finalizeSuccessfulPayment,
  ensureBookingFulfillment,
};
