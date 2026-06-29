const express = require('express');
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  getMyBookings,
  getBookingById,
  getAllBookingsAdmin,
  verifyTicket,
  getTicketDetails,
} = require('../controllers/bookingController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Private user routes
router.post('/create-order', protect, createOrder);
router.post('/verify-payment', protect, verifyPayment);
router.get('/my-bookings', protect, getMyBookings);
router.get('/ticket-details', protect, adminOnly, getTicketDetails);
router.put('/verify-ticket', protect, adminOnly, verifyTicket);

// Parameterized routes (must come after specific routes like /ticket-details)
router.get('/:id', protect, getBookingById);

// Admin routes
router.get('/admin/all', protect, adminOnly, getAllBookingsAdmin);

module.exports = router;
