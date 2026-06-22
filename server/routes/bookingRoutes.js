const express = require('express');
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  getMyBookings,
  getBookingById,
  getAllBookingsAdmin,
  verifyTicket,
} = require('../controllers/bookingController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Private user routes
router.post('/create-order', protect, createOrder);
router.post('/verify-payment', protect, verifyPayment);
router.get('/my-bookings', protect, getMyBookings);
router.get('/:id', protect, getBookingById);

// Admin routes
router.get('/admin/all', protect, adminOnly, getAllBookingsAdmin);
router.put('/verify/:id', protect, adminOnly, verifyTicket);

module.exports = router;
