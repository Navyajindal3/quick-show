/**
 * Test setup
 * Uses MongoMemoryReplSet (supports transactions) + ioredis-mock.
 * All env vars are set before any module requiring them is loaded.
 */

// ─── Test environment variables (must be set BEFORE any module loads) ─────────
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.JWT_SECRET = 'test_jwt_secret_that_is_long_enough_to_pass_validation_check';
process.env.TICKET_JWT_SECRET = 'test_ticket_jwt_secret_long_enough_for_validation_check_here';
process.env.JWT_EXPIRE = '1d';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.RAZORPAY_KEY_ID = 'rzp_test_123456789';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_1234567890abcdef';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_1234567890ab';
process.env.RESEND_API_KEY = 're_test_123';
process.env.RESEND_FROM_EMAIL = 'test@quickshow.app';
process.env.MAX_SEATS_PER_BOOKING = '8';
process.env.SEAT_LOCK_TTL_SECONDS = '600';
process.env.TRUST_PROXY = '0';
process.env.ALLOW_STANDALONE_MONGO = 'false';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const redis = require('../config/redis');

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
  try {
    await redis.quit();
  } catch {
    // May already be closed
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  await redis.flushall();
});
