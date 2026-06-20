import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyBookings, selectMyBookings, selectBookingLoading } from '../../redux/slices/bookingSlice';
import BookingCard from '../../components/user/BookingCard';
import Spinner from '../../components/common/Spinner';
import { Ticket, Film } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MyBookings() {
  const dispatch = useDispatch();
  const bookings = useSelector(selectMyBookings);
  const isLoading = useSelector(selectBookingLoading);

  useEffect(() => {
    dispatch(fetchMyBookings());
  }, []);

  const upcomingBookings = bookings.filter(
    (b) => b.paymentStatus === 'paid' && new Date(b.bookingSnapshot?.showTime) > new Date()
  );
  const pastBookings = bookings.filter(
    (b) => b.paymentStatus !== 'paid' || new Date(b.bookingSnapshot?.showTime) <= new Date()
  );

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px 60px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 36 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(229,9,20,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ticket size={22} color="#e50914" />
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'white' }}>My Bookings</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Your ticket history and upcoming shows</p>
          </div>
        </div>

        {isLoading ? (
          <Spinner text="Fetching your bookings..." />
        ) : bookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <Film size={64} style={{ margin: '0 auto 16px', opacity: 0.2, display: 'block' }} />
            <h3 style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 8 }}>No bookings yet</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Book your first movie ticket and it'll appear here</p>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <button className="btn-primary">Browse Movies</button>
            </Link>
          </div>
        ) : (
          <>
            {/* Upcoming */}
            {upcomingBookings.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                  Upcoming ({upcomingBookings.length})
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {upcomingBookings.map((booking) => (
                    <BookingCard key={booking._id} booking={booking} />
                  ))}
                </div>
              </div>
            )}

            {/* Past / Other */}
            {pastBookings.length > 0 && (
              <div>
                <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Past & Other ({pastBookings.length})
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: 0.75 }}>
                  {pastBookings.map((booking) => (
                    <BookingCard key={booking._id} booking={booking} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
