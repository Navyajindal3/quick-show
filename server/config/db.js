'use strict';

/**
 * MongoDB Connection & Transaction Capability Check
 * ==================================================
 * Connects to MongoDB and verifies that transactions are supported
 * (requires a replica set or sharded Atlas cluster).
 *
 * In production, standalone MongoDB will cause immediate startup failure.
 * In development, standalone is allowed ONLY when ALLOW_STANDALONE_MONGO=true.
 */

const mongoose = require('mongoose');
const config = require('./env');

/** Test whether the connected MongoDB supports multi-document transactions. */
const checkTransactionSupport = async () => {
  try {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      // No-op transaction — just verify the server accepts it
    });
    await session.endSession();
    return true;
  } catch (err) {
    // Code 20 = "Transaction numbers are only allowed on a replica member or mongos"
    if (
      err.code === 20 ||
      (err.message && err.message.toLowerCase().includes('replica'))
    ) {
      return false;
    }
    // Other errors (network, auth) — re-throw so startup fails with correct reason
    throw err;
  }
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.MONGO_URI);
    // Do not log the URI — it may contain credentials
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);

    // ─── Transaction capability check ─────────────────────────────────────
    const txSupported = await checkTransactionSupport();

    if (!txSupported) {
      const msg =
        'MongoDB does NOT support transactions. ' +
        'A replica set or Atlas cluster is required. ' +
        'See README.md for local replica-set setup instructions.';

      if (config.NODE_ENV === 'production') {
        console.error(`❌ FATAL: ${msg}`);
        process.exit(1);
      }

      if (!config.ALLOW_STANDALONE_MONGO) {
        console.error(
          `❌ FATAL: ${msg}\n` +
            '   For local development without a replica set, set ' +
            'ALLOW_STANDALONE_MONGO=true in your .env file. ' +
            'Note: payment finalization will not be atomic in this mode.'
        );
        process.exit(1);
      }

      console.warn(
        '⚠️  WARNING: Running with ALLOW_STANDALONE_MONGO=true. ' +
          'MongoDB transactions will NOT work. ' +
          'Payment finalization is NOT atomic. ' +
          'Do NOT use this setting in production.'
      );
    } else {
      console.log('✅ MongoDB transaction support verified (replica set / Atlas)');
    }
  } catch (error) {
    // Avoid logging the full URI which may contain credentials
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
