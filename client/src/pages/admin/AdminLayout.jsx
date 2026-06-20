import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout, selectCurrentUser } from '../../redux/slices/authSlice';
import {
  LayoutDashboard, Film, Building2, Clock, Ticket, LogOut,
  Menu, X, ChevronRight, TrendingUp,
} from 'lucide-react';
import api from '../../services/api';

const NAV_ITEMS = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { path: '/admin/movies', icon: Film, label: 'Movies' },
  { path: '/admin/theatres', icon: Building2, label: 'Theatres' },
  { path: '/admin/shows', icon: Clock, label: 'Shows' },
  { path: '/admin/bookings', icon: Ticket, label: 'Bookings' },
];

export default function AdminLayout({ children }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector(selectCurrentUser);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats, setStats] = useState({ movies: 0, theatres: 0, shows: 0, bookings: 0 });

  useEffect(() => {
    // Fetch summary stats for dashboard header
    const fetchStats = async () => {
      try {
        const [m, t, s, b] = await Promise.all([
          api.get('/movies/admin/all'),
          api.get('/theatres/admin/all'),
          api.get('/shows/admin/all'),
          api.get('/bookings/admin/all'),
        ]);
        setStats({
          movies: m.data.count,
          theatres: t.data.count,
          shows: s.data.count,
          bookings: b.data.count,
        });
      } catch (_) {}
    };
    fetchStats();
  }, []);

  const isActive = (path, exact) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path) && path !== '/admin';
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 240 : 64,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 50, transition: 'width 0.3s ease',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo area */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, minHeight: 64 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #e50914, #b81d24)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Film size={18} color="white" />
          </div>
          {sidebarOpen && (
            <span style={{ fontFamily: 'Poppins', fontWeight: 800, fontSize: 16, color: 'white', whiteSpace: 'nowrap' }}>
              Quick<span style={{ color: '#e50914' }}>Show</span>
            </span>
          )}
        </div>

        {/* Toggle button */}
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
          position: 'absolute', top: 20, right: -12,
          width: 24, height: 24, borderRadius: '50%',
          background: '#e50914', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 60,
        }}>
          {sidebarOpen ? <ChevronRight size={12} color="white" /> : <Menu size={12} color="white" />}
        </button>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map(({ path, icon: Icon, label, exact }) => {
            const active = isActive(path, exact);
            return (
              <Link key={path} to={path} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 10, transition: 'all 0.2s',
                  background: active ? 'rgba(229,9,20,0.15)' : 'transparent',
                  border: active ? '1px solid rgba(229,9,20,0.25)' : '1px solid transparent',
                  color: active ? '#ff6b6b' : 'var(--text-secondary)',
                }}>
                  <Icon size={18} style={{ flexShrink: 0 }} />
                  {sidebarOpen && (
                    <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  )}
                  {sidebarOpen && active && <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#e50914' }} />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div style={{ padding: '16px 8px', borderTop: '1px solid var(--border-subtle)' }}>
          {sidebarOpen && (
            <div style={{ padding: '8px 12px', marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Signed in as</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
            </div>
          )}
          <button onClick={() => { dispatch(logout()); navigate('/'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
              width: '100%', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(229,9,20,0.1)'; e.currentTarget.style.color = '#ff6b6b'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span style={{ fontSize: 13, fontWeight: 500 }}>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: sidebarOpen ? 240 : 64, flex: 1, minHeight: '100vh', transition: 'margin-left 0.3s ease' }}>
        {children}
      </main>
    </div>
  );
}
