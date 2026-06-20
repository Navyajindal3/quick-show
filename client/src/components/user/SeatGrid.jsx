import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toggleSeat, selectSelectedSeats } from '../../redux/slices/bookingSlice';
import { Monitor } from 'lucide-react';

/**
 * SeatGrid: Visual 6-row x 10-col seat layout.
 * Color codes: available (green), selected (red), locked (amber), booked (gray).
 *
 * @param {Object} seats - Map of seatLabel → status from the Show document
 */
export default function SeatGrid({ seats = {} }) {
  const dispatch = useDispatch();
  const selectedSeats = useSelector(selectSelectedSeats);

  const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
  const cols = Array.from({ length: 10 }, (_, i) => i + 1);

  const getSeatStatus = (label) => {
    if (selectedSeats.includes(label)) return 'selected';
    // seats can be a plain object (from API) or Map
    const status = seats instanceof Map ? seats.get(label) : seats[label];
    return status || 'available';
  };

  const handleSeatClick = (label) => {
    const status = getSeatStatus(label);
    if (status === 'locked' || status === 'booked') return; // Cannot select unavailable seats
    dispatch(toggleSeat(label));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      {/* Screen */}
      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(229,9,20,0.3), rgba(184,29,36,0.3))',
          border: '2px solid rgba(229,9,20,0.5)',
          borderRadius: '4px 4px 50% 50% / 4px 4px 20px 20px',
          padding: '10px 40px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 4,
          boxShadow: '0 0 30px rgba(229,9,20,0.2)',
        }}>
          <Monitor size={16} color="#e50914" />
          <span style={{ color: '#e50914', fontSize: 13, fontWeight: 600, letterSpacing: 3 }}>SCREEN</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>You are viewing from here</p>
      </div>

      {/* Seat Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => (
          <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Row label */}
            <span style={{ width: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
              {row}
            </span>

            {/* Aisle spacer after col 5 */}
            <div style={{ display: 'flex', gap: 6 }}>
              {cols.map((col) => {
                const label = `${row}${col}`;
                const status = getSeatStatus(label);
                return (
                  <React.Fragment key={label}>
                    {col === 6 && <div style={{ width: 16 }} />}
                    <button
                      className={`seat ${status}`}
                      onClick={() => handleSeatClick(label)}
                      title={`${label} - ${status}`}
                      style={{ fontFamily: 'monospace' }}
                    >
                      {col}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Right row label */}
            <span style={{ width: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
              {row}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        {[
          { color: '#22c55e', label: 'Available' },
          { color: '#e50914', label: 'Selected' },
          { color: '#f59e0b', label: 'Locked (by others)' },
          { color: '#374151', label: 'Booked' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 18, height: 16, borderRadius: '4px 4px 3px 3px', background: color }} />
            {label}
          </div>
        ))}
      </div>

      {/* Selected seats summary */}
      {selectedSeats.length > 0 && (
        <div style={{
          background: 'rgba(229,9,20,0.1)', border: '1px solid rgba(229,9,20,0.3)',
          borderRadius: 12, padding: '12px 20px',
          display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
          animation: 'fadeIn 0.3s ease',
        }}>
          <span style={{ color: '#ff6b6b', fontSize: 13, fontWeight: 600 }}>Selected:</span>
          {selectedSeats.map((seat) => (
            <span key={seat} style={{
              background: '#e50914', color: 'white', borderRadius: 6,
              padding: '2px 8px', fontSize: 12, fontWeight: 700,
            }}>
              {seat}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
