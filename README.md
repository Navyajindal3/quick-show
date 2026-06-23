# 🎬 QuickShow - Movie Ticket Booking System

![QuickShow](https://img.shields.io/badge/Status-Active-success) ![License](https://img.shields.io/badge/License-MIT-blue)

QuickShow is a modern, full-stack Movie Ticket Booking application. It provides a seamless interface for users to browse current movies, select seats in real-time, process secure payments, and receive a digital ticket with a verifiable QR code via email. 

### 🌐 Live Demo
**[Experience QuickShow Live](https://quick-show-seven-tau.vercel.app/)**

---

## ✨ Key Features

* **Real-time Seat Locking:** Powered by Redis to prevent double-booking. When a user selects a seat, it is temporarily locked across all sessions until checkout completion or timeout.
* **Secure Payment Integration:** Integrated with Razorpay for handling dynamic pricing and secure checkout processing, completely backed by webhooks to ensure payment resilience.
* **E-Tickets & QR Codes:** Upon successful payment, a cryptographic JWT-based QR Code is generated. 
* **Automated Email Delivery:** Uses the modern **Resend API** to instantly dispatch a rich HTML email with the user's booking details and scannable QR ticket.
* **State Management:** Fully optimized frontend utilizing Redux Toolkit.
* **Modern UI:** Built with Tailwind CSS v4, providing an immersive, fully responsive dark-theme design.

---

## 🛠️ Tech Stack

**Frontend:**
* React 19 (via Vite)
* Tailwind CSS v4
* Redux Toolkit
* React Router v7
* Axios
* Lucide React (Icons)

**Backend:**
* Node.js & Express.js
* MongoDB & Mongoose (Database)
* Redis (Concurrency control for seats)
* Razorpay (Payment Gateway)
* Resend (Email Provider)
* JSON Web Tokens (JWT Authentication & QR security)
* Node-Cron (Background tasks)

---

## 🚀 Local Setup & Installation

### Prerequisites
* Node.js (v18+ recommended)
* MongoDB Database URI
* Redis Instance URI
* Razorpay Account Keys
* Resend API Key

### 1. Clone the repository
```bash
git clone https://github.com/Navyajindal3/quick-show.git
cd quick-show
```

### 2. Backend Setup
```bash
cd server
npm install
```

Create a `.env` file in the `server` directory:
```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:5173

# Redis
REDIS_URI=your_redis_connection_string

# Razorpay
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Resend Email API
RESEND_API_KEY=your_resend_api_key

# TMDB (If fetching external movies)
TMDB_API_KEY=your_tmdb_api_key
```

Start the backend development server:
```bash
npm run dev
```

### 3. Frontend Setup
Open a new terminal window:
```bash
cd client
npm install
```

Start the frontend development server:
```bash
npm run dev
```

The application will be running at `http://localhost:5173`.

---

## 🏗️ Architecture Highlights

* **Webhook Resilience:** Razorpay webhooks are handled idempotently. Even if the client drops connection, the webhook guarantees the seat is booked, the Redis lock is cleared, and the email is sent.
* **Security:** The QR Code is not just a link; it's an encrypted JWT that can only be verified by the admin panel, preventing ticket forgery.
* **Graceful Degradation:** Emails are sent entirely asynchronously using `Resend`. The API returns a 200 OK to the payment gateway immediately without blocking the thread waiting for email delivery.

---

## 📄 License
This project is licensed under the MIT License.
