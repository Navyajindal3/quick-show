# 🎬 QuickShow — Movie Ticket Booking System

![Status](https://img.shields.io/badge/Status-Active-success) ![License](https://img.shields.io/badge/License-MIT-blue)

QuickShow is a full-stack movie ticket booking application with real-time seat locking, Razorpay payment processing, and durable email ticket delivery.

### 🌐 Live Demo
**[quick-show-seven-tau.vercel.app](https://quick-show-seven-tau.vercel.app/)**

---

## ✨ Key Features

- **Real-time Seat Locking** — Redis-backed per-seat locks prevent double-booking across concurrent sessions. Locks expire automatically after 10 minutes.
- **Payment Integration** — Razorpay order creation, frontend signature verification, and server-side webhook processing. Payment state is never trusted from the client.
- **Durable Fulfillment** — After payment, a FulfillmentJob is created atomically in MongoDB. A background worker sends ticket emails with retries and exponential backoff.
- **Signed QR Tickets** — Each ticket contains a tamper-evident signed JWT (not encrypted). The QR is scannable by admins to verify and mark attendance atomically.
- **Idempotent Webhooks** — Duplicate Razorpay webhook events are safely ignored. Payment processing is safe to retry.
- **Admin Operations** — Admins can view failed emails, pending/failed refunds, and stuck jobs. Manual retry is supported for both email delivery and refund processing.
- **Reconciliation** — A cron job runs every 5 minutes to catch paid bookings with unsent emails, missing refund jobs, and stuck processing jobs.

---

## 🛠️ Tech Stack

**Frontend:** React 19 (Vite), Tailwind CSS v4, Redux Toolkit, React Router v7, Axios

**Backend:** Node.js, Express.js, MongoDB + Mongoose, Redis (ioredis), Razorpay, Resend (email), JWT, Node-Cron, Helmet, express-rate-limit, Zod

---

## 🚀 Local Setup & Installation

### Prerequisites

- Node.js v18+
- **MongoDB with replica set support** — required for transactions. Use one of:
  - [MongoDB Atlas free tier](https://www.mongodb.com/cloud/atlas) (recommended)
  - Local replica set (see below)
- Redis instance (local or [Upstash](https://upstash.com/))
- Razorpay account (test mode)
- Resend API key

### Local MongoDB Replica Set (alternative to Atlas)

```bash
# Initialize a single-node replica set for local development
mongod --replSet rs0 --dbpath ./data/db --port 27017

# In another terminal, initialize the replica set once:
mongosh --eval "rs.initiate()"
```

Then use: `MONGO_URI=mongodb://localhost:27017/quickshow?replicaSet=rs0`

> ⚠️ Standalone MongoDB (without a replica set) is **not supported** in production and will cause startup failure. Set `ALLOW_STANDALONE_MONGO=true` in `.env` to allow it in development with a warning that payment finalization will not be atomic.

### 1. Clone the repository

```bash
git clone https://github.com/Navyajindal3/quick-show.git
cd quick-show
```

### 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
# Fill in all required variables in .env
```

**Required environment variables** (see `.env.example` for full documentation):

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string (Atlas or replica set) |
| `REDIS_URI` | Redis connection string |
| `JWT_SECRET` | Min 32 chars, for user authentication tokens |
| `TICKET_JWT_SECRET` | Min 32 chars, different from JWT_SECRET, for ticket QR tokens |
| `CLIENT_URL` | Frontend origin URL (e.g. `http://localhost:5173`) |
| `RAZORPAY_KEY_ID` | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook secret |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Sender email address |

### 3. Seed the database

```bash
cd server
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='StrongPass123!' node seed.js
```

Password requirements: minimum 12 characters, uppercase, lowercase, digit, symbol.

### 4. Run database migration (for existing deployments)

```bash
cd server
node scripts/migrate.js
```

### 5. Start the backend

```bash
# Start the API server
cd server
npm run dev

# In a separate terminal: start the fulfillment worker
cd server
npm run worker
```

### 6. Start the frontend

```bash
cd client
npm install
npm run dev
```

The application runs at `http://localhost:5173`.

---

## 🏗️ Architecture

### Payment Flow

```
User → Select seats → Lock seats (Redis, 10min TTL)
     → Create booking (MongoDB, pending)
     → Create Razorpay order
     → Pay via Razorpay popup
     → Frontend callback → verify-payment endpoint
         → Verify Razorpay signature (server-side secret)
         → finalizeSuccessfulPayment():
             MongoDB transaction:
               1. Verify lock ownership (Redis Lua script)
               2. Atomically book seats in Show document
               3. Mark booking as paid
               4. Create FulfillmentJob (send_ticket_email)
             Commit transaction
         → Release Redis locks (best-effort, outside transaction)
     → Return success to frontend

Razorpay webhook (payment.captured):
     → Verify webhook signature (raw body + webhook secret)
     → finalizeSuccessfulPayment() — idempotent, same as above
     → Return 200 OK immediately

Worker (runs every 5s):
     → Poll FulfillmentJob collection (SCAN-based, atomic claim)
     → send_ticket_email: generate signed QR, send via Resend, mark fulfilled
     → process_refund: call Razorpay refund API, record refund ID
     → Retry with exponential backoff on failure (max 5 attempts)
     → Stuck job recovery after 5 minutes

Reconciliation (cron, every 5min):
     → Re-queue email jobs for paid bookings missing jobs
     → Create refund jobs for bookings needing refunds with no job
     → Reset stuck processing jobs
```

### Redis Key Structure

```
lock:show_<showId>:seat_<seatLabel>  →  <lockToken>   (EX 600s)
```

- Individual keys with NX for atomic per-seat acquisition
- SCAN (never KEYS) for listing locked seats
- Lua scripts for atomic multi-seat verify/release

### Seat Lock Design

- Each seat gets its own Redis key with a UUID lock token
- The same token must be held by all requested seats
- Lock ownership is verified atomically before payment finalization
- Locks expire automatically; payment is rejected if locks expire
- One user cannot release another user's locks (token verification)

### Ticket QR Code

The QR code encodes a verification URL containing a **signed JWT** (not encrypted). It is tamper-evident: any modification invalidates the server-verified signature. The payload contains only `bookingId`, `userId`, and `type` — no email, payment data, or secrets.

Admins scan the QR to open the verification page, which verifies the JWT signature and marks the ticket as scanned atomically (preventing replay).

### Duplicate Event Handling

- **Frontend + webhook arriving simultaneously**: `finalizeSuccessfulPayment` uses conditional MongoDB updates (`paymentStatus: 'pending'` filter). Only one wins; the other gets `alreadyProcessed: true`.
- **Duplicate webhook events**: Same idempotency — the second call finds the booking already in `paid` state and returns early.
- **Duplicate email jobs**: FulfillmentJob uses a unique `idempotencyKey` index. Upsert with `$setOnInsert` is safe under concurrency.

---

## 🔒 Security

- **CORS**: Explicit allowlist — never reflects arbitrary origins when credentials are enabled.
- **Rate limiting**: Applied per-endpoint via `express-rate-limit` (login, register, seat locking, booking, admin actions).
- **Helmet**: Security headers enabled (CSP, HSTS, etc.).
- **JWT**: Cookie-based, `HttpOnly`, `Secure` in production, `SameSite=None` with credentials for cross-site deployment.
- **Webhook verification**: Razorpay webhooks verified against raw body using HMAC-SHA256.
- **Admin authorization**: All admin endpoints require `role: 'admin'` enforced server-side.
- **No secrets in logs**: Payment signatures, JWT values, cookie contents, and lock tokens are never logged.
- **Body size limits**: JSON requests limited to 50KB; webhooks to 100KB.

---

## 🧪 Testing

```bash
cd server

# Unit tests (no infrastructure needed)
npx jest tests/unit.test.js --forceExit

# Integration tests (uses in-memory MongoDB replica set + ioredis-mock)
npx jest tests/booking.test.js --runInBand --forceExit

# All tests
npm test
```

### Test coverage

**Unit tests (27):** Seat label validation, seat limits, Razorpay signature verification, webhook signature verification, ticket JWT properties, backoff calculation, state machine enums, idempotency key formats.

**Integration tests (22):** Concurrent seat lock acquisition, lock rollback on conflict, ownership verification, SCAN vs KEYS enforcement, atomic payment finalization, email job creation, payment idempotency, lost-lock refund path, duplicate payment ID rejection, Redis lock release, duplicate webhook handling, admin retry operations, atomic ticket scanning, replay rejection, seat count limits, FulfillmentJob uniqueness constraints.

---

## 🛠️ Operational Runbook

### Admin: view problematic bookings

```
GET /api/bookings/admin/issues
Authorization: Bearer <admin-jwt>
```

Returns: failed emails, pending/failed refunds, failed fulfillment jobs.

### Admin: retry ticket email

```
POST /api/bookings/admin/:bookingId/retry-email
Authorization: Bearer <admin-jwt>
```

### Admin: retry refund

```
POST /api/bookings/admin/:bookingId/retry-refund
Authorization: Bearer <admin-jwt>
```

### Health check

```
GET /api/health
```

Returns DB connection status without exposing credentials.

---

## 🚀 Production Deployment

1. **Infrastructure**: Provision MongoDB Atlas cluster (M10+ for transactions), Redis (Upstash or managed Redis).
2. **Environment**: Set all required variables from `.env.example`. Ensure `NODE_ENV=production`, `TRUST_PROXY` matches your proxy count.
3. **Deploy code**: Run `npm install --production` in `server/`.
4. **Run migration**: `node scripts/migrate.js` before starting the new version.
5. **Start API server**: `node server.js` (or use PM2/systemd).
6. **Start worker**: `node worker.js` (separate process, same environment).
7. **Configure Razorpay webhook**: Point to `https://yourdomain.com/api/webhook/razorpay` with events: `payment.captured`, `refund.created`, `refund.processed`, `refund.failed`.
8. **Verify health check**: `GET /api/health` should return `{"status":"healthy","db":"connected"}`.

### Deployment order for schema-breaking changes

1. Deploy migration-compatible code (backward-compatible schema)
2. Run `node scripts/migrate.js`
3. Start new version of API server
4. Start new version of worker
5. Verify health checks
6. Remove obsolete code in next release

---

## ⚠️ Known Limitations

- **Rate limiting**: Currently uses in-memory storage (per process). For multi-instance deployments, replace with Redis-backed rate limiting (e.g. `rate-limit-redis`).
- **Worker**: Single worker process. For higher throughput, run multiple worker instances — the atomic job claiming prevents duplicate processing.
- **CSRF**: Cookie-based auth is used with `SameSite=None` for cross-site deployment. Double-submit CSRF tokens are not implemented; the deployment relies on `SameSite=None` + Strict Origin validation + explicit CORS allowlist.
- **Reconciliation**: Runs in the same process as the API server. For very high load, extract to a dedicated process.

---

## 📄 License

MIT
