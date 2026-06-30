'use strict';

/**
 * Environment Configuration Validator
 * =====================================
 * Validates all required environment variables at startup.
 * Fails fast with a clear, non-sensitive error list.
 * Exports a typed config object for use throughout the application.
 *
 * NEVER access process.env directly in other modules —
 * import this config object instead.
 */

const { z } = require('zod');

// ─── Schema ──────────────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === 'production';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  // MongoDB — must be a replica set or Atlas URI for transaction support
  MONGO_URI: z.string().url({ message: 'MONGO_URI must be a valid URL' }),

  // Redis
  REDIS_URI: isProd
    ? z.string().url({ message: 'REDIS_URI must be a valid URL in production' })
    : z.string().url({ message: 'REDIS_URI must be a valid URL' }).optional(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRE: z.string().default('7d'),
  TICKET_JWT_SECRET: z
    .string()
    .min(32, 'TICKET_JWT_SECRET must be at least 32 characters'),

  // Frontend origin — used for CORS and QR URL generation
  CLIENT_URL: z.string().url({ message: 'CLIENT_URL must be a valid URL' }),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().min(1, 'RAZORPAY_KEY_ID is required'),
  RAZORPAY_KEY_SECRET: z.string().min(1, 'RAZORPAY_KEY_SECRET is required'),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1, 'RAZORPAY_WEBHOOK_SECRET is required'),

  // Resend email
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  RESEND_FROM_EMAIL: z
    .string()
    .email({ message: 'RESEND_FROM_EMAIL must be a valid email' })
    .default('noreply@quickshow.app'),

  // TMDB (optional)
  TMDB_API_KEY: z.string().optional(),

  // Seat and booking limits
  MAX_SEATS_PER_BOOKING: z.coerce.number().int().min(1).max(20).default(8),
  SEAT_LOCK_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(600),

  // MongoDB transaction support override (for development without replica set)
  ALLOW_STANDALONE_MONGO: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // Trust proxy (for rate limiting behind load balancer)
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

// ─── Validate ─────────────────────────────────────────────────────────────────

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const formatted = result.error.errors
    .map((e) => `  • [${e.path.join('.')}] ${e.message}`)
    .join('\n');
  // Never log actual values — only field names and constraint messages
  console.error(`\n❌ Environment validation failed:\n${formatted}\n`);
  process.exit(1);
}

const config = result.data;

// Production-specific additional checks
if (config.NODE_ENV === 'production') {
  if (!config.REDIS_URI) {
    console.error('❌ REDIS_URI is required in production');
    process.exit(1);
  }
  if (config.ALLOW_STANDALONE_MONGO) {
    console.error(
      '❌ ALLOW_STANDALONE_MONGO must not be set in production. Use a replica set or Atlas.'
    );
    process.exit(1);
  }
}

module.exports = config;
