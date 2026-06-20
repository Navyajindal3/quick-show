import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Ticket, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

/**
 * BookingCard: Displays a single booking in the My Bookings list.
 * Shows movie poster, title, show details, seat info, and QR code.
 */
export default function BookingCard({ booking }) {
  const { _id, bookingSnapshot, seatsSelected, totalAmount, paymentStatus, qrCodeUrl, createdAt } = booking;

  const statusConfig = {
    paid: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', icon: CheckCircle, label: 'Confirmed' },
    pending: { color: '#fbbf24', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: AlertCircle, label: 'Pending' },
    failed: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: XCircle, label: 'Failed' },
  };

  const status = statusConfig[paymentStatus] || statusConfig.pending;
  const StatusIcon = status.icon;

  const showDate = bookingSnapshot?.showTime ? new Date(bookingSnapshot.showTime) : null;
  const isUpcoming = showDate && showDate > new Date();

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${paymentStatus === 'paid' ? 'rgba(229,9,20,0.2)' : 'var(--border-subtle)'}`,
      borderRadius: 16,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(229,9,20,0.4)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = paymentStatus === 'paid' ? 'rgba(229,9,20,0.2)' : 'var(--border-subtle)'}
    >
      {/* Header bar */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(229,9,20,0.15), rgba(0,0,0,0))',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ticket size={16} color="#e50914" />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Booking ID: <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
              {_id?.slice(-8).toUpperCase()}
            </span>
          </span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: status.bg, border: `1px solid ${status.border}`,
          borderRadius: 20, padding: '4px 12px',
        }}>
          <StatusIcon size={12} color={status.color} />
          <span style={{ fontSize: 12, fontWeight: 600, color: status.color }}>{status.label}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Movie Info */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 12 }}>
            {bookingSnapshot?.movieTitle}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
              <MapPin size={14} color="#e50914" />
              <span>{bookingSnapshot?.theatreName} · Screen {bookingSnapshot?.screenNumber}</span>
            </div>
            {showDate && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                  <Calendar size={14} color="#e50914" />
                  <span>{showDate.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                  <Clock size={14} color="#e50914" />
                  <span>{showDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </>
            )}
          </div>

          {/* Seats */}
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              {seatsSelected?.length} Seat(s) · ₹{totalAmount}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {seatsSelected?.map((seat) => (
                <span key={seat} style={{
                  background: 'rgba(229,9,20,0.15)', border: '1px solid rgba(229,9,20,0.3)',
                  borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 700, color: '#ff6b6b',
                }}>
                  {seat}
                </span>
              ))}
            </div>
          </div>

          {/* Upcoming badge */}
          {isUpcoming && paymentStatus === 'paid' && (
            <div style={{
              marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 8, padding: '6px 12px',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa' }}>Upcoming Show</span>
            </div>
          )}
        </div>

        {/* QR Code */}
        {paymentStatus === 'paid' && qrCodeUrl && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Show at entrance</p>
            <div style={{
              background: 'white', borderRadius: 12, padding: 8,
              border: '3px solid #e50914',
              boxShadow: '0 0 20px rgba(229,9,20,0.2)',
            }}>
              <img src={qrCodeUrl} alt="Ticket QR Code" style={{ width: 120, height: 120, display: 'block' }} />
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Scan to verify</p>
          </div>
        )}
      </div>
    </div>
  );
}
