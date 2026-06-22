import React, { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toggleSeat, selectSelectedSeats } from '../../redux/slices/bookingSlice';
import { Monitor } from 'lucide-react';

/**
 * SeatGrid: Visual seat layout with categorized pricing tiers.
 * Color codes: available (green/category specific), selected (red), locked (amber), booked (gray).
 *
 * @param {Object} seats - Object of seatLabel → { status, category }
 * @param {Object} categoryPricing - Object mapping categoryName → price
 */
export default function SeatGrid({ seats = {}, categoryPricing = {} }) {
  const dispatch = useDispatch();
  const selectedSeats = useSelector(selectSelectedSeats);

  const getSeatInfo = (label) => {
    return seats[label] || { status: 'available', category: 'Standard' };
  };

  const getSeatStatus = (label) => {
    if (selectedSeats.includes(label)) return 'selected';
    return getSeatInfo(label).status;
  };

  const handleSeatClick = (label) => {
    const status = getSeatStatus(label);
    if (status === 'locked' || status === 'booked') return;
    dispatch(toggleSeat(label));
  };

  // Group rows by category
  // Extract all unique row labels and their categories
  const rowCategories = useMemo(() => {
    const mapping = {};
    Object.keys(seats).forEach(label => {
      const row = label.replace(/[0-9]/g, '');
      if (!mapping[row]) {
        mapping[row] = seats[label].category;
      }
    });
    return mapping;
  }, [seats]);

  // Group the rows. E.g. { 'Recliner': ['A'], 'Premium': ['B', 'C'], 'Standard': ['D', 'E', 'F'] }
  const groupedRows = useMemo(() => {
    const groups = {};
    // Sort rows alphabetically to maintain order
    const sortedRows = Object.keys(rowCategories).sort();
    sortedRows.forEach(row => {
      const category = rowCategories[row];
      if (!groups[category]) groups[category] = [];
      groups[category].push(row);
    });
    return groups;
  }, [rowCategories]);

  // Columns 1 to 10
  const cols = Array.from({ length: 10 }, (_, i) => i + 1);

  // Helper to order categories based on pricing (highest first)
  const sortedCategories = Object.keys(groupedRows).sort((a, b) => {
    const priceA = categoryPricing[a] || 0;
    const priceB = categoryPricing[b] || 0;
    return priceB - priceA;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      
      {/* Category Pricing Legend */}
      {Object.keys(categoryPricing).length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 8 }}>
          {sortedCategories.map(cat => (
            <div key={cat} style={{ 
              display: 'flex', alignItems: 'center', gap: 6, 
              background: 'rgba(255,255,255,0.05)', 
              padding: '6px 12px', borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{cat}</span>
              <span style={{ fontSize: 12, color: '#4ade80' }}>₹{categoryPricing[cat]}</span>
            </div>
          ))}
        </div>
      )}

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

      {/* Seat Grid - Grouped by Category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', alignItems: 'center' }}>
        {sortedCategories.map((category) => (
          <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%' }}>
            
            {/* Tier divider / title */}
            <div style={{ 
              display: 'flex', alignItems: 'center', width: '100%', maxWidth: 500, gap: 12, opacity: 0.7 
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
                {category} - ₹{categoryPricing[category]}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            </div>

            {/* Rows for this tier */}
            {groupedRows[category].map((row) => (
              <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                  {row}
                </span>

                <div style={{ display: 'flex', gap: 6 }}>
                  {cols.map((col) => {
                    const label = `${row}${col}`;
                    const status = getSeatStatus(label);
                    // Add a class based on tier for potential custom styling
                    const tierClass = `tier-${category.toLowerCase()}`;
                    return (
                      <React.Fragment key={label}>
                        {col === 6 && <div style={{ width: 16 }} />}
                        <button
                          className={`seat ${status} ${tierClass}`}
                          onClick={() => handleSeatClick(label)}
                          title={`${label} - ${category} (₹${categoryPricing[category] || 0})`}
                          style={{ fontFamily: 'monospace' }}
                        >
                          {col}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>

                <span style={{ width: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                  {row}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Status Legend */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        {[
          { color: '#22c55e', label: 'Available' },
          { color: '#e50914', label: 'Selected' },
          { color: '#f59e0b', label: 'Locked' },
          { color: '#374151', label: 'Booked' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 18, height: 16, borderRadius: '4px 4px 3px 3px', background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
