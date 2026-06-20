import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchShowById, selectCurrentShow } from '../../redux/slices/movieSlice';
import { selectSelectedSeats, createRazorpayOrder, verifyRazorpayPayment, selectBookingLoading, releaseSeats } from '../../redux/slices/bookingSlice';
import { selectCurrentUser } from '../../redux/slices/authSlice';
import Spinner from '../../components/common/Spinner';
import { ArrowLeft, MapPin, Clock, Ticket, CreditCard, Shield, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Checkout() {
  const { showId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const show = useSelector(selectCurrentShow);
  const selectedSeats = useSelector(selectSelectedSeats);
  const isLoading = useSelector(selectBookingLoading);
  const user = useSelector(selectCurrentUser);

  useEffect(() => {
    dispatch(fetchShowById(showId));
    // Guard: if no seats selected, go back
    if (selectedSeats.length === 0) {
      navigate(`/seat-selection/${showId}`);
    }
  }, [dispatch, showId, navigate, selectedSeats.length]);

  const handleGoBack = async () => {
    // Release locked seats when user cancels
    if (selectedSeats.length > 0) {
      await dispatch(releaseSeats({ showId, seatLabels: selectedSeats }));
    }
    navigate(`/seat-selection/${showId}`);
  };

  const handlePayment = async () => {
    const orderResult = await dispatch(createRazorpayOrder({ showId, seatLabels: selectedSeats }));
    
    if (createRazorpayOrder.fulfilled.match(orderResult)) {
      const { order, bookingId } = orderResult.payload;

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'QuickShow 🎬',
        description: 'Movie Ticket Booking',
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyResult = await dispatch(verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId,
            }));

            if (verifyRazorpayPayment.fulfilled.match(verifyResult)) {
              navigate(`/booking-success?bookingId=${bookingId}`);
            } else {
              toast.error('Payment verification failed. Please contact support.');
            }
          } catch (error) {
            toast.error('Payment verification error.');
          }
        },
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        theme: {
          color: '#e50914',
        },
      };

      const rzp = new window.Razorpay(options);
      
      rzp.on('payment.failed', function (response) {
        toast.error(`Payment failed: ${response.error.description}`);
      });

      rzp.open();
    } else {
      toast.error(orderResult.payload || 'Failed to initiate payment');
    }
  };

  if (!show) return <Spinner text="Loading order summary..." />;

  const { movie, theatre, showTime, screenNumber, ticketPrice } = show;
  const subtotal = selectedSeats.length * ticketPrice;
  const convenienceFee = Math.round(subtotal * 0.02); // 2% convenience fee
  const totalAmount = subtotal + convenienceFee;

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px 60px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Back */}
        <button onClick={handleGoBack} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
          fontSize: 14, marginBottom: 24, padding: 0,
        }}>
          <ArrowLeft size={16} /> Back to Seat Selection
        </button>

        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'white', marginBottom: 28 }}>
          Order Summary
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}>
          {/* Left: Order Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Movie card */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>
                Booking Details
              </h2>

              <div style={{ display: 'flex', gap: 16 }}>
                {movie?.posterUrl && (
                  <img src={movie.posterUrl} alt={movie.title}
                    style={{ width: 80, height: 120, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
                    onError={(e) => e.target.style.display = 'none'}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 12 }}>{movie?.title}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                      <MapPin size={14} color="#e50914" />
                      {theatre?.name} · Screen {screenNumber}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                      <Clock size={14} color="#e50914" />
                      {new Date(showTime).toLocaleString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                      <Ticket size={14} color="#e50914" />
                      Seats: <strong style={{ color: 'white' }}>{selectedSeats.join(', ')}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Seat Chips */}
            <div className="glass-card" style={{ padding: 20 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Selected Seats ({selectedSeats.length})
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedSeats.map((seat) => (
                  <span key={seat} style={{
                    background: 'linear-gradient(135deg, #e50914, #b81d24)', color: 'white',
                    borderRadius: 8, padding: '6px 14px', fontWeight: 800, fontSize: 14,
                  }}>
                    {seat}
                  </span>
                ))}
              </div>
            </div>

            {/* Trust badges */}
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { icon: Shield, text: 'Secure Payment', color: '#4ade80' },
                { icon: CreditCard, text: 'Razorpay Protected', color: '#60a5fa' },
              ].map(({ icon: Icon, text, color }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  <Icon size={15} color={color} /> {text}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Price Summary */}
          <div style={{ width: 280 }}>
            <div className="glass-card" style={{ padding: 24, position: 'sticky', top: 88 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: 'white', marginBottom: 20 }}>Price Breakdown</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-secondary)' }}>
                  <span>₹{ticketPrice} × {selectedSeats.length} seat(s)</span>
                  <span>₹{subtotal}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-secondary)' }}>
                  <span>Convenience Fee</span>
                  <span>₹{convenienceFee}</span>
                </div>
                <div style={{ height: 1, background: 'var(--border-subtle)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: 'white' }}>
                  <span>Total</span>
                  <span style={{ color: '#e50914' }}>₹{totalAmount}</span>
                </div>
              </div>

              <button
                id="pay-now-btn"
                onClick={handlePayment}
                disabled={isLoading}
                className="btn-primary"
                style={{ width: '100%', padding: '16px', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <CreditCard size={18} />
                {isLoading ? 'Processing...' : 'Pay Now'}
              </button>

              <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
                Secure inline payment via Razorpay
              </p>

              {/* Lock warning */}
              <div style={{
                marginTop: 16, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={14} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 11, color: '#fbbf24', lineHeight: 1.5 }}>
                  Your seats are temporarily locked for 10 minutes. Complete payment to confirm.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
