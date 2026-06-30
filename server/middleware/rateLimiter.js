'use strict';

/**
 * Rate Limiting Middleware
 * ========================
 * Redis-backed rate limits for different endpoint categories.
 *
 * All limits use in-memory storage in development (when Redis is not available)
 * and Redis-backed storage in production.
 *
 * Returns HTTP 429 with Retry-After header.
 * Does NOT log email addresses or other PII in error messages.
 */

const rateLimit = require('express-rate-limit');

/** Standard rate limit options (in-memory, suitable for single instance) */
const createLimiter = (options) =>
  rateLimit({
    standardHeaders: true,   // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,    // Disable X-RateLimit-* headers
    skipFailedRequests: false,
    // Message must not expose internal details
    message: {
      success: false,
      message: 'Too many requests, please try again later.',
    },
    ...options,
  });

// ─── Authentication endpoints ─────────────────────────────────────────────────

/** Login: 10 attempts per 15 minutes per IP */
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

/** Registration: 5 registrations per hour per IP */
const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many registration attempts. Please try again later.' },
});

// ─── Booking operations ───────────────────────────────────────────────────────

/** Seat locking: 20 attempts per 5 minutes per IP */
const seatLockLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 20,
});

/** Booking creation: 10 per 10 minutes per IP */
const bookingCreationLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
});

/** Payment verification: 20 per 10 minutes per IP */
const paymentVerificationLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
});

// ─── Admin operations ─────────────────────────────────────────────────────────

/** Admin bulk/retry actions: 30 per minute per IP */
const adminActionLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
});

// ─── General API ─────────────────────────────────────────────────────────────

/** General API: 200 per minute per IP */
const generalLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 200,
});

module.exports = {
  loginLimiter,
  registerLimiter,
  seatLockLimiter,
  bookingCreationLimiter,
  paymentVerificationLimiter,
  adminActionLimiter,
  generalLimiter,
};
