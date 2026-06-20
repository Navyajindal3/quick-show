import React, { useEffect, useState } from 'react';
import { Film, Building2, Clock, Ticket, TrendingUp, IndianRupee, Users } from 'lucide-react';
import api from '../../services/api';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../redux/slices/authSlice';
import AdminLayout from './AdminLayout';

export default function AdminDashboard() {
  const user = useSelector(selectCurrentUser);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [movies, theatres, shows, bookings] = await Promise.all([
          api.get('/movies/admin/all'),
          api.get('/theatres/admin/all'),
          api.get('/shows/admin/all'),
          api.get('/bookings/admin/all'),
        ]);

        const allBookings = bookings.data.bookings;
        const paidBookings = allBookings.filter((b) => b.paymentStatus === 'paid');
        const revenue = paidBookings.reduce((sum, b) => sum + b.totalAmount, 0);

        setStats({
          movies: movies.data.count,
          theatres: theatres.data.count,
          shows: shows.data.count,
          totalBookings: allBookings.length,
          paidBookings: paidBookings.length,
          revenue,
          recentBookings: allBookings.slice(0, 5),
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total Movies', value: stats?.movies ?? '—', icon: Film, color: '#e50914', bg: 'rgba(229,9,20,0.15)' },
    { label: 'Theatres', value: stats?.theatres ?? '—', icon: Building2, color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
    { label: 'Active Shows', value: stats?.shows ?? '—', icon: Clock, color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
    { label: 'Total Bookings', value: stats?.totalBookings ?? '—', icon: Ticket, color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
    { label: 'Confirmed Bookings', value: stats?.paidBookings ?? '—', icon: TrendingUp, color: '#4ade80', bg: 'rgba(74,222,128,0.15)' },
    { label: 'Total Revenue', value: stats ? `₹${stats.revenue.toLocaleString()}` : '—', icon: IndianRupee, color: '#fb923c', bg: 'rgba(251,146,60,0.15)' },
  ];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 32px 60px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'white', marginBottom: 6 }}>
            Welcome back, {user?.name?.split(' ')[0]}! 👋
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Here's an overview of your QuickShow platform
          </p>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 40 }}>
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="glass-card hover-lift" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={color} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'white', marginBottom: 4 }}>{loading ? '...' : value}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Recent Bookings */}
        <div className="glass-card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 20 }}>Recent Bookings</h2>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
          ) : stats?.recentBookings?.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No bookings yet</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {['User', 'Movie', 'Seats', 'Amount', 'Status'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.recentBookings.map((b) => (
                    <tr key={b._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 12px', color: 'white', fontWeight: 500 }}>{b.user?.name || 'Unknown'}</td>
                      <td style={{ padding: '12px 12px', color: 'var(--text-secondary)' }}>{b.bookingSnapshot?.movieTitle}</td>
                      <td style={{ padding: '12px 12px', color: 'var(--text-secondary)' }}>{b.seatsSelected?.join(', ')}</td>
                      <td style={{ padding: '12px 12px', color: '#4ade80', fontWeight: 700 }}>₹{b.totalAmount}</td>
                      <td style={{ padding: '12px 12px' }}>
                        <span className={`badge ${b.paymentStatus === 'paid' ? 'badge-green' : b.paymentStatus === 'pending' ? 'badge-yellow' : 'badge-red'}`}>
                          {b.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
