import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// ─── Thunks ───────────────────────────────────────────────────────────────

export const createRazorpayOrder = createAsyncThunk(
  'booking/createRazorpayOrder',
  async ({ showId, seatLabels, lockToken }, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/bookings/create-order', { showId, seatLabels, lockToken });
      return data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create order');
    }
  }
);

export const verifyRazorpayPayment = createAsyncThunk(
  'booking/verifyRazorpayPayment',
  async (paymentData, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/bookings/verify-payment', paymentData);
      return data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Payment verification failed');
    }
  }
);

export const fetchMyBookings = createAsyncThunk(
  'booking/fetchMyBookings',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/bookings/my-bookings');
      return data.bookings;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch bookings');
    }
  }
);

export const fetchBookingById = createAsyncThunk(
  'booking/fetchById',
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/bookings/${id}`);
      return data.booking;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Booking not found');
    }
  }
);

export const lockSeats = createAsyncThunk(
  'booking/lockSeats',
  async ({ showId, seatLabels }, { rejectWithValue }) => {
    try {
      const { data } = await api.patch(`/shows/${showId}/lock-seats`, { seatLabels });
      return data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to lock seats');
    }
  }
);

export const releaseSeats = createAsyncThunk(
  'booking/releaseSeats',
  async ({ showId, seatLabels, lockToken }, { rejectWithValue }) => {
    try {
      const { data } = await api.patch(`/shows/${showId}/release-seats`, { seatLabels, lockToken });
      return data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to release seats');
    }
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────

const getInitialState = () => {
  const defaultState = {
    selectedSeats: [],
    currentBooking: null,
    myBookings: [],
    lockToken: null,
    isLoading: false,
    error: null,
  };
  try {
    const stored = sessionStorage.getItem('seatLock');
    if (stored) {
      const data = JSON.parse(stored);
      if (data.expiresAt && new Date(data.expiresAt) > new Date()) {
        return {
          ...defaultState,
          selectedSeats: data.seatLabels || [],
          lockToken: data.lockToken,
        };
      } else {
        sessionStorage.removeItem('seatLock');
      }
    }
  } catch (e) {
    // ignore
  }
  return defaultState;
};

const bookingSlice = createSlice({
  name: 'booking',
  initialState: getInitialState(),
  reducers: {
    toggleSeat(state, action) {
      const seatLabel = action.payload;
      const idx = state.selectedSeats.indexOf(seatLabel);
      if (idx === -1) {
        state.selectedSeats.push(seatLabel);
      } else {
        state.selectedSeats.splice(idx, 1);
      }
    },
    clearSelectedSeats(state) {
      state.selectedSeats = [];
      state.lockToken = null;
      sessionStorage.removeItem('seatLock');
    },
    clearBookingError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Create Razorpay Order
    builder
      .addCase(createRazorpayOrder.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(createRazorpayOrder.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentBooking = { _id: action.payload.bookingId, order: action.payload.order };
      })
      .addCase(createRazorpayOrder.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // Verify Razorpay Payment
    builder
      .addCase(verifyRazorpayPayment.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(verifyRazorpayPayment.fulfilled, (state) => {
        state.isLoading = false;
        sessionStorage.removeItem('seatLock');
      })
      .addCase(verifyRazorpayPayment.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // Fetch my bookings
    builder
      .addCase(fetchMyBookings.pending, (state) => { state.isLoading = true; })
      .addCase(fetchMyBookings.fulfilled, (state, action) => {
        state.isLoading = false;
        state.myBookings = action.payload;
      })
      .addCase(fetchMyBookings.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // Fetch single booking
    builder
      .addCase(fetchBookingById.pending, (state) => { state.isLoading = true; })
      .addCase(fetchBookingById.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentBooking = action.payload;
      })
      .addCase(fetchBookingById.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // Lock seats
    builder
      .addCase(lockSeats.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(lockSeats.fulfilled, (state, action) => { 
        state.isLoading = false; 
        state.lockToken = action.payload.lockToken;
        sessionStorage.setItem('seatLock', JSON.stringify({
          seatLabels: state.selectedSeats,
          lockToken: action.payload.lockToken,
          expiresAt: new Date(Date.now() + action.payload.expiresIn * 1000).toISOString()
        }));
      })
      .addCase(lockSeats.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
        state.selectedSeats = []; // Clear selection on failure
        state.lockToken = null;
        sessionStorage.removeItem('seatLock');
      })
      .addCase(releaseSeats.fulfilled, (state) => {
        sessionStorage.removeItem('seatLock');
      });
  },
});

export const { toggleSeat, clearSelectedSeats, clearBookingError } = bookingSlice.actions;

// Selectors
export const selectSelectedSeats = (state) => state.booking.selectedSeats;
export const selectLockToken = (state) => state.booking.lockToken;
export const selectMyBookings = (state) => state.booking.myBookings;
export const selectCurrentBooking = (state) => state.booking.currentBooking;
export const selectBookingLoading = (state) => state.booking.isLoading;
export const selectBookingError = (state) => state.booking.error;

export default bookingSlice.reducer;
