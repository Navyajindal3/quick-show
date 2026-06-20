import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import movieReducer from './slices/movieSlice';
import bookingReducer from './slices/bookingSlice';

const store = configureStore({
  reducer: {
    auth: authReducer,
    movies: movieReducer,
    booking: bookingReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these fields (Map from Mongoose is not serializable in redux devtools)
        ignoredActions: ['movies/fetchShowById/fulfilled'],
        ignoredPaths: ['movies.currentShow.seats'],
      },
    }),
});

export default store;
