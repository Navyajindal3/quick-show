const express = require('express');
const router = express.Router();
const { razorpayWebhook } = require('../controllers/bookingController');

// Webhook endpoint
// NOTE: express.raw() is applied globally in server.js before mounting this router, 
// so req.body will be a Buffer.
router.post('/razorpay', razorpayWebhook);

module.exports = router;
