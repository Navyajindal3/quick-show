import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// ─── Thunks ───────────────────────────────────────────────────────────────

export const fetchMovies = createAsyncThunk(
  'movies/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/movies', { params });
      return data.movies;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch movies');
    }
  }
);

export const fetchMovieById = createAsyncThunk(
  'movies/fetchById',
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/movies/${id}`);
      return data.movie;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Movie not found');
    }
  }
);

export const fetchShowsByMovie = createAsyncThunk(
  'movies/fetchShows',
  async ({ movieId, date }, { rejectWithValue }) => {
    try {
      const params = date ? { date } : {};
      const { data } = await api.get(`/shows/movie/${movieId}`, { params });
      return data.shows;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch shows');
    }
  }
);

export const fetchShowById = createAsyncThunk(
  'movies/fetchShowById',
  async (showId, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/shows/${showId}`);
      return data.show;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Show not found');
    }
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────

const movieSlice = createSlice({
  name: 'movies',
  initialState: {
    list: [],
    currentMovie: null,
    shows: [],       // Shows for current movie
    currentShow: null,
    isLoading: false,
    error: null,
  },
  reducers: {
    clearCurrentMovie(state) {
      state.currentMovie = null;
      state.shows = [];
    },
    clearCurrentShow(state) {
      state.currentShow = null;
    },
    updateShowSeats(state, action) {
      // Update seat map locally after locking (optimistic update)
      if (state.currentShow) {
        const { seatLabel, status } = action.payload;
        if (state.currentShow.seats) {
          state.currentShow.seats[seatLabel] = status;
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMovies.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchMovies.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list = action.payload;
      })
      .addCase(fetchMovies.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    builder
      .addCase(fetchMovieById.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchMovieById.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentMovie = action.payload;
      })
      .addCase(fetchMovieById.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    builder
      .addCase(fetchShowsByMovie.pending, (state) => { state.isLoading = true; })
      .addCase(fetchShowsByMovie.fulfilled, (state, action) => {
        state.isLoading = false;
        state.shows = action.payload;
      })
      .addCase(fetchShowsByMovie.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    builder
      .addCase(fetchShowById.pending, (state) => { state.isLoading = true; })
      .addCase(fetchShowById.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentShow = action.payload;
      })
      .addCase(fetchShowById.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearCurrentMovie, clearCurrentShow, updateShowSeats } = movieSlice.actions;

// Selectors
export const selectMovies = (state) => state.movies.list;
export const selectCurrentMovie = (state) => state.movies.currentMovie;
export const selectShows = (state) => state.movies.shows;
export const selectCurrentShow = (state) => state.movies.currentShow;
export const selectMoviesLoading = (state) => state.movies.isLoading;
export const selectMoviesError = (state) => state.movies.error;

export default movieSlice.reducer;
