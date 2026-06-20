import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchShowById, selectCurrentShow, selectMoviesLoading } from '../../redux/slices/movieSlice';
import { selectSelectedSeats, toggleSeat, clearSelectedSeats, lockSeats } from '../../redux/slices/bookingSlice';
import SeatGrid from '../../components/user/SeatGrid';
import Spinner from '../../components/common/Spinner';
import { ArrowLeft, Clock, MapPin, Film, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SeatSelection() {
  const { showId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const show = useSelector(selectCurrentShow);
  const isLoading = useSelector(selectMoviesLoading);
  const selectedSeats = useSelector(selectSelectedSeats);

  useEffect(() => {
    dispatch(fetchShowById(showId));
    dispatch(clearSelectedSeats());
  }, [showId]);

  const handleProceed = async () => {
    if (selectedSeats.length === 0) {
      toast.error('Please select at least one seat');
      return;
    }

    const result = await dispatch(lockSeats({ showId, seatLabels: selectedSeats }));
    if (lockSeats.fulfilled.match(result)) {
      navigate(`/checkout/${showId}`);
    } else {
      toast.error(result.payload || 'Seats no longer available');
      dispatch(fetchShowById(showId)); // Refresh seat map
    }
  };

  if (isLoading && !show) return <Spinner text="Loading seats..." />;
  if (!show) return null;

  const { movie, theatre, showTime, screenNumber, ticketPrice, seats } = show;
  const totalAmount = selectedSeats.length * ticketPrice;

  // Convert seats Map to plain object for SeatGrid
  const seatsObj = seats instanceof Map ? Object.fromEntries(seats) : (seats || {});

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px 60px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Back button */}
        <button onClick={() => navigate(-1)} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
          fontSize: 14, marginBottom: 24, padding: 0, transition: 'color 0.2s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = 'white'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        >
          <ArrowLeft size={16} /> Back to Showtimes
        </button>

        {/* Show info bar */}
        <div className="glass-card" style={{ padding: '16px 24px', marginBottom: 32, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <Film size={18} color="#e50914" />
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Movie</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{movie?.title}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <MapPin size={18} color="#e50914" />
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Theatre · Screen {screenNumber}</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{theatre?.name}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={18} color="#e50914" />
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Show Time</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>
                {new Date(showTime).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IndianRupee size={16} color="#4ade80" />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#4ade80' }}>{ticketPrice}/seat</span>
          </div>
        </div>

        {/* Seat Grid */}
        <div className="glass-card" style={{ padding: '32px 24px', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'white', textAlign: 'center', marginBottom: 28 }}>
            Select Your Seats
          </h2>
          <SeatGrid seats={seatsObj} />
        </div>

        {/* Booking Summary & CTA */}
        {selectedSeats.length > 0 && (
          <div className="glass-card animate-fade-in" style={{
            padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 16, border: '1px solid rgba(229,9,20,0.3)',
            background: 'rgba(229,9,20,0.05)',
          }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                {selectedSeats.length} seat(s) selected: <strong style={{ color: 'white' }}>{selectedSeats.join(', ')}</strong>
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: 'white' }}>₹{totalAmount}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>total</span>
              </div>
            </div>
            <button
              id="proceed-to-checkout"
              onClick={handleProceed}
              className="btn-primary"
              style={{ fontSize: 15, padding: '14px 32px' }}
            >
              Proceed to Payment →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
