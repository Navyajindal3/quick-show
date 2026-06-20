import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout, selectCurrentUser, selectIsAuthenticated } from '../../redux/slices/authSlice';
import { Film, Ticket, User, LogOut, Menu, X, LayoutDashboard } from 'lucide-react';

export default function Navbar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const currentUser = useSelector(selectCurrentUser);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
    setMenuOpen(false);
  };

  return (
    <nav style={{
      background: 'rgba(10, 10, 15, 0.95)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, #e50914, #b81d24)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Film size={20} color="white" />
          </div>
          <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 20, color: 'white' }}>
            Quick<span style={{ color: '#e50914' }}>Show</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isAuthenticated ? (
            <>
              {currentUser?.role === 'admin' && (
                <Link to="/admin" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, color: '#fbbf24', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(251,191,36,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <LayoutDashboard size={16} /> Admin
                </Link>
              )}
              <Link to="/my-bookings" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, color: '#a0a0b0', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Ticket size={16} /> My Tickets
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8 }}>
                <div style={{
                  width: 34, height: 34,
                  background: 'linear-gradient(135deg, #e50914, #b81d24)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: 'white',
                }}>
                  {currentUser?.name?.[0]?.toUpperCase()}
                </div>
                <button onClick={handleLogout} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8,
                  background: 'rgba(229,9,20,0.1)', border: '1px solid rgba(229,9,20,0.2)',
                  color: '#ff6b6b', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(229,9,20,0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(229,9,20,0.1)'}
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login" style={{ padding: '9px 20px', borderRadius: 8, color: '#a0a0b0', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
                Login
              </Link>
              <Link to="/register" className="btn-primary" style={{ padding: '9px 20px', borderRadius: 9, textDecoration: 'none', fontSize: 14 }}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
