import axios from 'axios';

// 1. Define the dynamic URL right here
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

/**
 * Axios instance configured with base URL and auth interceptor.
 * All API calls should use this instance.
 */
const api = axios.create({
  // 2. Inject it into the baseURL, keeping the /api suffix
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Attach cookies automatically
});

// Response interceptor: handle 401 (auto-logout on token expiry)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user');
      // Redirect to login if not already there
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;