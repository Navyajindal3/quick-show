'use strict';

const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/bookingController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ─── User routes ──────────────────────────────────────────────────────────────
router.post('/create-order', protect, createOrder);
router.post('/verify-payment', protect, verifyPayment);
router.get('/my-bookings', protect, getMyBookings);

// ─── Admin routes (specific paths before parameterized /:id) ─────────────────
router.get('/admin/all', protect, adminOnly, getAllBookingsAdmin);
router.get('/admin/issues', protect, adminOnly, getAdminIssues);
router.post('/admin/:id/retry-email', protect, adminOnly, adminRetryEmail);
router.post('/admin/:id/retry-refund', protect, adminOnly, adminRetryRefund);

// ─── Ticket management (admin) ────────────────────────────────────────────────
router.get('/ticket-details', protect, adminOnly, getTicketDetails);
router.put('/verify-ticket', protect, adminOnly, verifyTicket);

// ─── Parameterized routes (must come after all specific routes) ───────────────
router.get('/:id', protect, getBookingById);

module.exports = router;
