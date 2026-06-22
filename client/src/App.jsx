import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import store from './redux/store';

// Layout
import Navbar from './components/common/Navbar';
import ProtectedRoute from './components/common/ProtectedRoute';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// User Pages
import Home from './pages/user/Home';
import MovieDetail from './pages/user/MovieDetail';
import SeatSelection from './pages/user/SeatSelection';
import Checkout from './pages/user/Checkout';
import BookingSuccess from './pages/user/BookingSuccess';
import MyBookings from './pages/user/MyBookings';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import ManageMovies from './pages/admin/ManageMovies';
import ManageTheatres from './pages/admin/ManageTheatres';
import ManageShows from './pages/admin/ManageShows';
import AdminBookings from './pages/admin/AdminBookings';
import VerifyTicket from './pages/admin/VerifyTicket';

/**
 * Layout wrapper for user-facing pages (with Navbar)
 */
function UserLayout({ children }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
    </>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <Router>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e1e2a',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#e50914', secondary: '#fff' } },
          }}
        />

        <Routes>
          {/* ─── Public User Routes ─────────────────────────────────── */}
          <Route path="/" element={<UserLayout><Home /></UserLayout>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/movies/:id" element={<UserLayout><MovieDetail /></UserLayout>} />

          {/* ─── Protected User Routes ──────────────────────────────── */}
          <Route path="/seat-selection/:showId" element={
            <ProtectedRoute>
              <UserLayout><SeatSelection /></UserLayout>
            </ProtectedRoute>
          } />
          <Route path="/checkout/:showId" element={
            <ProtectedRoute>
              <UserLayout><Checkout /></UserLayout>
            </ProtectedRoute>
          } />
          <Route path="/booking-success" element={
            <ProtectedRoute>
              <UserLayout><BookingSuccess /></UserLayout>
            </ProtectedRoute>
          } />
          <Route path="/my-bookings" element={
            <ProtectedRoute>
              <UserLayout><MyBookings /></UserLayout>
            </ProtectedRoute>
          } />

          {/* ─── Admin Routes (Admin-only) ──────────────────────────── */}
          <Route path="/admin" element={
            <ProtectedRoute adminOnly>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/movies" element={
            <ProtectedRoute adminOnly>
              <ManageMovies />
            </ProtectedRoute>
          } />
          <Route path="/admin/theatres" element={
            <ProtectedRoute adminOnly>
              <ManageTheatres />
            </ProtectedRoute>
          } />
          <Route path="/admin/shows" element={
            <ProtectedRoute adminOnly>
              <ManageShows />
            </ProtectedRoute>
          } />
          <Route path="/admin/bookings" element={
            <ProtectedRoute adminOnly>
              <AdminBookings />
            </ProtectedRoute>
          } />
          <Route path="/admin/verify/:id" element={
            <ProtectedRoute adminOnly>
              <VerifyTicket />
            </ProtectedRoute>
          } />

          {/* ─── Fallback ────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </Provider>
  );
}
