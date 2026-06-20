import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated, selectIsAdmin } from '../../redux/slices/authSlice';

/**
 * ProtectedRoute: Redirects to /login if not authenticated.
 * If adminOnly=true, also redirects if user is not an admin.
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isAdmin = useSelector(selectIsAdmin);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
