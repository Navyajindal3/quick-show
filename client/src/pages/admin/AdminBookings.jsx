import React, { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import api from '../../services/api';
import { Ticket, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get('/bookings/admin/all')
      .then(({ data }) => setBookings(data.bookings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? bookings : bookings.filter((b) => b.paymentStatus === filter);
  const revenue = bookings.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.totalAmount, 0);

  const statusConfig = {
    paid: { color: '#4ade80', icon: CheckCircle },
    pending: { color: '#fbbf24', icon: AlertCircle },
    failed: { color: '#ef4444', icon: XCircle },
  };

  return (
    <AdminLayout>
      <div style={{ padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>Bookings</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {bookings.filter((b) => b.paymentStatus === 'paid').length} paid · Total Revenue: ₹{revenue.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {['all', 'paid', 'pending', 'failed'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: filter === f ? 'linear-gradient(135deg, #e50914, #b81d24)' : 'var(--bg-elevated)',
                color: filter === f ? 'white' : 'var(--text-secondary)',
                border: filter === f ? 'none' : '1px solid var(--border-subtle)',
                textTransform: 'capitalize',
              }}>
              {f === 'all' ? 'All' : f} ({f === 'all' ? bookings.length : bookings.filter((b) => b.paymentStatus === f).length})
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Booking ID', 'User', 'Movie', 'Seats', 'Amount', 'Status', 'Date'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const { color, icon: Icon } = statusConfig[b.paymentStatus] || statusConfig.pending;
                  return (
                    <tr key={b._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                        {b._id?.slice(-8).toUpperCase()}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'white', fontWeight: 600 }}>
                        <p>{b.user?.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.user?.email}</p>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{b.bookingSnapshot?.movieTitle}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{b.seatsSelected?.join(', ')}</td>
                      <td style={{ padding: '12px 16px', color: '#4ade80', fontWeight: 700 }}>₹{b.totalAmount}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon size={14} color={color} />
                          <span style={{ fontSize: 12, fontWeight: 600, color, textTransform: 'capitalize' }}>{b.paymentStatus}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Ticket size={32} style={{ margin: '0 auto 8px', opacity: 0.3, display: 'block' }} />
                No bookings found
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
