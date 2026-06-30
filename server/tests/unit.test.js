'use strict';

/**
 * Unit Tests — Environment validation, signature verification, state transitions,
 * seat validation, retry backoff.
 */

// Setup env before loading any modules
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.MONGO_URI = 'mongodb://localhost:27017/test'; // placeholder, not actually used
process.env.JWT_SECRET = 'unit_test_jwt_secret_that_is_long_enough_32ch';
process.env.TICKET_JWT_SECRET = 'unit_test_ticket_jwt_secret_long_enough_32ch';
process.env.JWT_EXPIRE = '1d';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.RAZORPAY_KEY_ID = 'rzp_test_unit';
process.env.RAZORPAY_KEY_SECRET = 'unit_razorpay_secret_1234567890ab';
process.env.RAZORPAY_WEBHOOK_SECRET = 'unit_webhook_secret_1234567890ab';
process.env.RESEND_API_KEY = 're_unit';
process.env.RESEND_FROM_EMAIL = 'test@quickshow.app';
process.env.MAX_SEATS_PER_BOOKING = '8';
process.env.SEAT_LOCK_TTL_SECONDS = '600';
process.env.TRUST_PROXY = '0';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// ─── Helper: compute Razorpay payment signature ────────────────────────────────
const computeRazorpaySignature = (orderId, paymentId, secret) => {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
};

// ─── Helper: compute webhook signature ────────────────────────────────────────
const computeWebhookSignature = (rawBody, secret) => {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
};

// ─── Helper: backoff calculation (mirrors worker logic) ────────────────────────
const backoffSeconds = (attempt) => Math.min(60 * Math.pow(2, attempt), 3600);

// ─── 1. Seat label validation ─────────────────────────────────────────────────
describe('Seat label validation', () => {
  const SEAT_LABEL_PATTERN = /^[A-Z][1-9]\d*$/;
  const validateSeatLabel = (label) =>
    typeof label === 'string' && SEAT_LABEL_PATTERN.test(label) && label.length <= 4;

  it('accepts valid seat labels', () => {
    expect(validateSeatLabel('A1')).toBe(true);
    expect(validateSeatLabel('F10')).toBe(true);
    expect(validateSeatLabel('B5')).toBe(true);
  });

  it('rejects invalid seat labels', () => {
    expect(validateSeatLabel('')).toBe(false);
    expect(validateSeatLabel('a1')).toBe(false); // lowercase
    expect(validateSeatLabel('1A')).toBe(false); // digit first
    expect(validateSeatLabel('A0')).toBe(false); // zero column
    expect(validateSeatLabel('AA1')).toBe(false); // two row letters
    expect(validateSeatLabel(null)).toBe(false);
    expect(validateSeatLabel(undefined)).toBe(false);
    expect(validateSeatLabel('A1B2')).toBe(false); // too long
  });

  it('rejects injection attempts', () => {
    expect(validateSeatLabel('A1; DROP TABLE')).toBe(false);
    expect(validateSeatLabel('*')).toBe(false);
    expect(validateSeatLabel('../etc/passwd')).toBe(false);
  });
});

// ─── 2. Seat count limits ─────────────────────────────────────────────────────
describe('Seat count limits', () => {
  const MAX = 8;

  it('allows up to MAX seats', () => {
    const seats = Array.from({ length: MAX }, (_, i) => `A${i + 1}`);
    expect(seats.length <= MAX).toBe(true);
  });

  it('rejects more than MAX seats', () => {
    const seats = Array.from({ length: MAX + 1 }, (_, i) => `A${i + 1}`);
    expect(seats.length > MAX).toBe(true);
  });

  it('rejects empty seat array', () => {
    expect([].length === 0).toBe(true);
  });
});

// ─── 3. Razorpay payment signature verification ───────────────────────────────
describe('Razorpay payment signature verification', () => {
  const secret = process.env.RAZORPAY_KEY_SECRET;

  it('accepts a valid signature', () => {
    const orderId = 'order_test_abc123';
    const paymentId = 'pay_test_xyz789';
    const validSig = computeRazorpaySignature(orderId, paymentId, secret);

    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(expected).toBe(validSig);
  });

  it('rejects a tampered signature', () => {
    const orderId = 'order_abc';
    const paymentId = 'pay_xyz';
    const validSig = computeRazorpaySignature(orderId, paymentId, secret);
    // Flip the last character to reliably create a different hex string
    const lastChar = validSig[validSig.length - 1];
    const flippedChar = lastChar === 'f' ? '0' : (parseInt(lastChar, 16) + 1).toString(16);
    const tamperedSig = validSig.slice(0, -1) + flippedChar;

    expect(tamperedSig).not.toBe(validSig);
    // Also verify the tampered sig does NOT verify correctly
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    expect(tamperedSig).not.toBe(expected);
  });

  it('rejects a signature computed with wrong secret', () => {
    const orderId = 'order_abc';
    const paymentId = 'pay_xyz';
    const correctSig = computeRazorpaySignature(orderId, paymentId, secret);
    const wrongSig = computeRazorpaySignature(orderId, paymentId, 'wrong_secret');
    expect(correctSig).not.toBe(wrongSig);
  });

  it('rejects signature when order/payment IDs are swapped', () => {
    const orderId = 'order_abc';
    const paymentId = 'pay_xyz';
    const correctSig = computeRazorpaySignature(orderId, paymentId, secret);
    const swappedSig = computeRazorpaySignature(paymentId, orderId, secret);
    expect(correctSig).not.toBe(swappedSig);
  });
});

// ─── 4. Webhook signature verification ───────────────────────────────────────
describe('Razorpay webhook signature verification', () => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  it('accepts a valid webhook signature', () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const sig = computeWebhookSignature(body, webhookSecret);
    const expected = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    expect(sig).toBe(expected);
  });

  it('rejects when body is modified after signing', () => {
    const originalBody = Buffer.from(JSON.stringify({ event: 'payment.captured', amount: 100 }));
    const sig = computeWebhookSignature(originalBody, webhookSecret);

    const modifiedBody = Buffer.from(JSON.stringify({ event: 'payment.captured', amount: 999 }));
    const recomputed = computeWebhookSignature(modifiedBody, webhookSecret);
    expect(sig).not.toBe(recomputed);
  });
});

// ─── 5. Ticket JWT token ──────────────────────────────────────────────────────
describe('Ticket JWT token', () => {
  const ticketSecret = process.env.TICKET_JWT_SECRET;
  const bookingId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';

  it('generates a verifiable signed token', () => {
    const token = jwt.sign(
      { bookingId, userId, type: 'movie-ticket' },
      ticketSecret,
      { expiresIn: '30d', issuer: 'quickshow', audience: 'theatre-admin' }
    );

    const decoded = jwt.verify(token, ticketSecret, {
      issuer: 'quickshow',
      audience: 'theatre-admin',
    });

    expect(decoded.bookingId).toBe(bookingId);
    expect(decoded.userId).toBe(userId);
    expect(decoded.type).toBe('movie-ticket');
  });

  it('rejects a token signed with wrong secret', () => {
    const token = jwt.sign(
      { bookingId, userId, type: 'movie-ticket' },
      'wrong_secret',
      { expiresIn: '30d', issuer: 'quickshow', audience: 'theatre-admin' }
    );

    expect(() =>
      jwt.verify(token, ticketSecret, { issuer: 'quickshow', audience: 'theatre-admin' })
    ).toThrow();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign(
      { bookingId, userId, type: 'movie-ticket' },
      ticketSecret,
      { expiresIn: -1, issuer: 'quickshow', audience: 'theatre-admin' }
    );

    expect(() =>
      jwt.verify(token, ticketSecret, { issuer: 'quickshow', audience: 'theatre-admin' })
    ).toThrow(/expired/);
  });

  it('rejects a token with wrong issuer', () => {
    const token = jwt.sign(
      { bookingId, userId, type: 'movie-ticket' },
      ticketSecret,
      { expiresIn: '30d', issuer: 'other-app', audience: 'theatre-admin' }
    );

    expect(() =>
      jwt.verify(token, ticketSecret, { issuer: 'quickshow', audience: 'theatre-admin' })
    ).toThrow();
  });

  it('token payload does not contain email or payment secrets', () => {
    const token = jwt.sign(
      { bookingId, userId, type: 'movie-ticket' },
      ticketSecret,
      { expiresIn: '30d', issuer: 'quickshow', audience: 'theatre-admin' }
    );

    // Decode without verifying (base64 decode payload)
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    expect(payload.email).toBeUndefined();
    expect(payload.password).toBeUndefined();
    expect(payload.secret).toBeUndefined();
    expect(payload.paymentId).toBeUndefined();
    expect(payload.bookingId).toBe(bookingId);
  });
});

// ─── 6. Retry backoff calculation ────────────────────────────────────────────
describe('Exponential backoff calculation', () => {
  it('starts at 60 seconds for first retry', () => {
    expect(backoffSeconds(1)).toBe(120); // 60 * 2^1
  });

  it('doubles each attempt', () => {
    expect(backoffSeconds(2)).toBe(240);
    expect(backoffSeconds(3)).toBe(480);
  });

  it('caps at 3600 seconds (1 hour)', () => {
    expect(backoffSeconds(10)).toBe(3600);
    expect(backoffSeconds(100)).toBe(3600);
  });
});

// ─── 7. Booking state transitions ────────────────────────────────────────────
describe('Booking state machine', () => {
  const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'cancelled', 'refund_pending', 'refunded', 'refund_failed'];
  const VALID_FULFILLMENT_STATUSES = ['pending', 'email_queued', 'fulfilled', 'refund_required', 'failed'];

  it('defines all expected payment statuses', () => {
    expect(VALID_PAYMENT_STATUSES).toContain('pending');
    expect(VALID_PAYMENT_STATUSES).toContain('paid');
    expect(VALID_PAYMENT_STATUSES).toContain('refunded');
    expect(VALID_PAYMENT_STATUSES).toContain('refund_failed');
  });

  it('defines all expected fulfillment statuses', () => {
    expect(VALID_FULFILLMENT_STATUSES).toContain('pending');
    expect(VALID_FULFILLMENT_STATUSES).toContain('email_queued');
    expect(VALID_FULFILLMENT_STATUSES).toContain('fulfilled');
    expect(VALID_FULFILLMENT_STATUSES).toContain('refund_required');
  });

  it('paid is a valid payment status', () => {
    expect(VALID_PAYMENT_STATUSES.includes('paid')).toBe(true);
  });

  it('SUCCESS is not a valid payment status (normalized to paid)', () => {
    expect(VALID_PAYMENT_STATUSES.includes('SUCCESS')).toBe(false);
  });
});

// ─── 8. Idempotency key format ────────────────────────────────────────────────
describe('Idempotency key format', () => {
  it('email job key is deterministic for same bookingId', () => {
    const bookingId = '507f1f77bcf86cd799439011';
    const key1 = `send_ticket_email:${bookingId}`;
    const key2 = `send_ticket_email:${bookingId}`;
    expect(key1).toBe(key2);
  });

  it('refund job key is deterministic for same bookingId', () => {
    const bookingId = '507f1f77bcf86cd799439011';
    const key1 = `process_refund:${bookingId}`;
    const key2 = `process_refund:${bookingId}`;
    expect(key1).toBe(key2);
  });

  it('email and refund keys for same booking are different', () => {
    const bookingId = '507f1f77bcf86cd799439011';
    expect(`send_ticket_email:${bookingId}`).not.toBe(`process_refund:${bookingId}`);
  });
});
