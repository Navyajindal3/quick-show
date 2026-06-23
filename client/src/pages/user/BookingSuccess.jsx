import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { clearSelectedSeats } from '../../redux/slices/bookingSlice';
import api from '../../services/api';
import Spinner from '../../components/common/Spinner';
import { CheckCircle, Ticket, MapPin, Clock, Home, ArrowRight } from 'lucide-react';

export default function BookingSuccess() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('bookingId');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  const [booking, setBooking] = useState(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    dispatch(clearSelectedSeats());
    
    if (bookingId) {
      const fetchBooking = async () => {
        try {
          const res = await api.get(`/bookings/${bookingId}`);
          setBooking(res.data.booking);
        } catch (error) {
          console.error("Failed to fetch booking:", error);
        } finally {
          setIsProcessing(false);
        }
      };

      fetchBooking();
    } else {
      setIsProcessing(false);
    }
  }, [bookingId, dispatch]);

  if (isProcessing) return <Spinner text="Confirming your booking..." />;

  const isPaid = booking?.paymentStatus === 'paid';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 600, width: '100%', textAlign: 'center' }} className="animate-fade-in">
        {/* Success Icon */}
        <div style={{
          width: 100, height: 100, borderRadius: '50%',
          background: isPaid ? 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.1))' : 'rgba(245,158,11,0.15)',
          border: `3px solid ${isPaid ? '#22c55e' : '#f59e0b'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: `0 0 40px ${isPaid ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
          animation: 'pulse-glow 2s infinite',
        }}>
          <CheckCircle size={48} color={isPaid ? '#22c55e' : '#f59e0b'} />
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 900, color: 'white', marginBottom: 12 }}>
          {isPaid ? 'Booking Confirmed! 🎉' : 'Payment Processing...'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 16, marginBottom: 32 }}>
          {isPaid
            ? 'Your tickets have been booked. Enjoy the movie!'
            : 'Your payment is being processed. This may take a moment.'}
        </p>

        {/* Booking details */}
        {booking && (
          <div className="glass-card" style={{ padding: 28, marginBottom: 24, textAlign: 'left' }}>
            <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 12 }}>
                  {booking.bookingSnapshot?.movieTitle}
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
                    <MapPin size={15} color="#e50914" />
                    {booking.bookingSnapshot?.theatreName} · Screen {booking.bookingSnapshot?.screenNumber}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
                    <Clock size={15} color="#e50914" />
                    {booking.bookingSnapshot?.showTime && new Date(booking.bookingSnapshot.showTime).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
                    <Ticket size={15} color="#e50914" />
                    Seats: <strong style={{ color: 'white' }}>{booking.seatsSelected?.join(', ')}</strong>
                  </div>
                </div>

                <div style={{ marginTop: 16, padding: '10px 16px', background: 'var(--bg-elevated)', borderRadius: 10, display: 'inline-block' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Paid: </span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#e50914' }}>₹{booking.totalAmount}</span>
                </div>
              </div>

              {/* QR Code */}
              {isPaid && booking.qrCodeUrl && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Your e-Ticket</p>
                  <div style={{
                    background: 'white', borderRadius: 14, padding: 10,
                    border: '4px solid #e50914',
                    boxShadow: '0 0 30px rgba(229,9,20,0.3)',
                    display: 'inline-block',
                  }}>
                    <img src={booking.qrCodeUrl} alt="Secure Ticket QR Code" style={{ width: 150, height: 150, display: 'block' }} />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Show at entrance</p>
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              Booking ID: <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{booking._id}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/my-bookings" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ticket size={16} /> View My Bookings <ArrowRight size={16} />
            </button>
          </Link>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Home size={16} /> Back to Home
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
