'use strict';

/**
 * QuickShow API Server
 * ====================
 * Startup order matters:
 *   1. Load environment variables
 *   2. Validate configuration (fails fast if misconfigured)
 *   3. Connect to MongoDB (checks transaction support)
 *   4. Configure Express middleware
 *   5. Mount routes
 *   6. Start HTTP server
 */

// ─── Step 1 & 2: Environment (must come first) ──────────────────────────────
const dotenv = require('dotenv');
dotenv.config();
const config = require('./config/env'); // Validates and fails fast if misconfigured

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { initCronJobs } = require('./utils/cronJobs');
const {
  generalLimiter,
  loginLimiter,
  registerLimiter,
  seatLockLimiter,
  bookingCreationLimiter,
  paymentVerificationLimiter,
  adminActionLimiter,
} = require('./middleware/rateLimiter');

// ─── Step 3: Connect to MongoDB ──────────────────────────────────────────────
connectDB(); // Async but we don't await — server starts, rejects requests if not connected

// ─── Initialize cron jobs ─────────────────────────────────────────────────────
initCronJobs();

const app = express();

// ─── Trust proxy (for rate limiting behind load balancers) ────────────────────
if (config.TRUST_PROXY > 0) {
  app.set('trust proxy', config.TRUST_PROXY);
}

// ─── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ──────────────────────────────────────────────────────────────────────
// Explicit allowlist — NEVER reflect arbitrary origins with credentials
const rawClientUrl = config.CLIENT_URL.replace(/\/+$/, '');
const allowedOrigins = [rawClientUrl];

// Support additional trusted origins (e.g. staging, preview deployments)
if (process.env.ADDITIONAL_ORIGINS) {
  process.env.ADDITIONAL_ORIGINS.split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.startsWith('http'))
    .forEach((o) => allowedOrigins.push(o));
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin requests (no origin header) and listed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Body size limits ─────────────────────────────────────────────────────────
// Webhook route must use raw body BEFORE json parser
app.use(
  '/api/webhook',
  express.raw({ type: 'application/json', limit: '100kb' }),
  require('./routes/paymentRoutes')
);

// All other routes use JSON with a strict size limit
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cookieParser());

// ─── General rate limit (all API routes) ──────────────────────────────────────
app.use('/api', generalLimiter);

// ─── API Routes ───────────────────────────────────────────────────────────────
const authRouter = require('./routes/authRoutes');
const bookingRouter = require('./routes/bookingRoutes');

// Apply specific rate limits before mounting
authRouter.post('/login', loginLimiter);
authRouter.post('/register', registerLimiter);

app.use('/api/auth', authRouter);
app.use('/api/movies', require('./routes/movieRoutes'));
app.use('/api/theatres', require('./routes/theatreRoutes'));

// Show routes with seat-lock rate limit
const showRouter = require('./routes/showRoutes');
showRouter.use('/:id/lock-seats', seatLockLimiter);
app.use('/api/shows', showRouter);

// Booking routes with specific limits
bookingRouter.use('/create-order', bookingCreationLimiter);
bookingRouter.use('/verify-payment', paymentVerificationLimiter);
bookingRouter.use('/admin', adminActionLimiter);
app.use('/api/bookings', bookingRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbState = mongoose.connection.readyState;
  // 1 = connected, 2 = connecting
  const dbReady = dbState === 1;

  res.status(dbReady ? 200 : 503).json({
    success: dbReady,
    status: dbReady ? 'healthy' : 'degraded',
    environment: config.NODE_ENV,
    db: dbReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    // Do NOT expose MONGO_URI, credentials, or configuration details
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.path} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`\n🚀 QuickShow Server running on port ${PORT}`);
  console.log(`📺 Environment: ${config.NODE_ENV}\n`);
});

module.exports = app; // For testing
