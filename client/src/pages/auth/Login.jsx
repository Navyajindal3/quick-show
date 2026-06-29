import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser, selectAuthLoading, selectAuthError, selectIsAuthenticated, clearError } from '../../redux/slices/authSlice';
import { Film, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isLoading = useSelector(selectAuthLoading);
  const error = useSelector(selectAuthError);

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const previousLocation = location.state?.from;
  const from = previousLocation 
    ? `${previousLocation.pathname}${previousLocation.search || ''}` 
    : '/';

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [isAuthenticated]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      dispatch(clearError());
    }
  }, [error]);

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(loginUser(formData));
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      background: 'radial-gradient(ellipse at 50% 0%, rgba(229,9,20,0.15) 0%, transparent 60%), var(--bg-primary)',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }} className="animate-fade-in">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64,
            background: 'linear-gradient(135deg, #e50914, #b81d24)',
            borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 0 40px rgba(229,9,20,0.4)',
          }}>
            <Film size={32} color="white" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'white', marginBottom: 8 }}>
            Welcome back
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Login to book your favourite movies
          </p>
        </div>

        {/* Card */}
        <div className="glass-card" style={{ padding: 32 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="login-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com"
                  required
                  className="input-field"
                  style={{ paddingLeft: 42 }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  className="input-field"
                  style={{ paddingLeft: 42, paddingRight: 42 }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={isLoading}
              className="btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: 15, marginTop: 4 }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#e50914', fontWeight: 600, textDecoration: 'none' }}>
              Sign up
            </Link>
          </p>

          {/* Demo credentials hint */}
          <div style={{
            marginTop: 20, background: 'rgba(229,9,20,0.05)', border: '1px solid rgba(229,9,20,0.15)',
            borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)',
          }}>
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Demo Admin:</p>
            <p>Email: admin@quickshow.com</p>
            <p>Password: admin123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
