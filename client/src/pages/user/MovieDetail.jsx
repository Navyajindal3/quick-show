import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchMovieById, fetchShowsByMovie,
  selectCurrentMovie, selectShows, selectMoviesLoading,
} from '../../redux/slices/movieSlice';
import { selectIsAuthenticated } from '../../redux/slices/authSlice';
import Spinner from '../../components/common/Spinner';
import { Clock, Globe, Star, Calendar, MapPin, ChevronRight, Film } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MovieDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const movie = useSelector(selectCurrentMovie);
  const shows = useSelector(selectShows);
  const isLoading = useSelector(selectMoviesLoading);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const [selectedDate, setSelectedDate] = useState('');

  // Generate next 7 days for date selector
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  useEffect(() => {
    dispatch(fetchMovieById(id));
    dispatch(fetchShowsByMovie({ movieId: id }));
  }, [id]);

  const handleShowClick = (show) => {
    if (!isAuthenticated) {
      toast.error('Please login to book tickets');
      navigate('/login');
      return;
    }
    navigate(`/seat-selection/${show._id}`);
  };

  const handleDateSelect = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    setSelectedDate(dateStr);
    dispatch(fetchShowsByMovie({ movieId: id, date: dateStr }));
  };

  // Group shows by theatre
  const showsByTheatre = shows.reduce((acc, show) => {
    const theatreId = show.theatre._id;
    if (!acc[theatreId]) {
      acc[theatreId] = { theatre: show.theatre, shows: [] };
    }
    acc[theatreId].shows.push(show);
    return acc;
  }, {});

  if (isLoading && !movie) return <Spinner text="Loading movie..." />;
  if (!movie) return null;

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Hero Banner */}
      <div style={{
        position: 'relative', height: 420, overflow: 'hidden',
        background: 'var(--bg-secondary)',
      }}>
        {/* Blurred backdrop */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${movie.posterUrl})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(20px) brightness(0.3)',
          transform: 'scale(1.1)',
        }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, var(--bg-primary) 100%)' }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 1280, margin: '0 auto', padding: '40px 24px', display: 'flex', gap: 36, alignItems: 'flex-start' }}>
          {/* Poster */}
          <div style={{ flexShrink: 0 }}>
            <img src={movie.posterUrl} alt={movie.title}
              style={{ width: 160, height: 240, objectFit: 'cover', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.1)' }}
              onError={(e) => { e.target.src = `https://placehold.co/160x240/1a1a2e/e50914?text=${encodeURIComponent(movie.title)}`; }}
            />
          </div>

          {/* Info */}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 'clamp(24px, 4vw, 42px)', fontWeight: 900, color: 'white', marginBottom: 12 }}>
              {movie.title}
            </h1>

            {/* Meta row */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
              {movie.rating > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fbbf24' }}>
                  <Star size={16} fill="#fbbf24" /> <span style={{ fontWeight: 700 }}>{movie.rating}/10</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <Clock size={15} /> {movie.duration} min
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <Globe size={15} /> {movie.language}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <Calendar size={15} /> {new Date(movie.releaseDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>

            {/* Genres */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {movie.genre?.map((g) => (
                <span key={g} className="badge badge-red">{g}</span>
              ))}
            </div>

            {movie.director && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Director: </span>
                <span style={{ fontWeight: 600, color: 'white' }}>{movie.director}</span>
              </p>
            )}

            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, maxWidth: 600 }}>
              {movie.description}
            </p>
          </div>
        </div>
      </div>

      {/* Shows Section */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 60px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 24 }}>
          Select Date & Theatre
        </h2>

        {/* Date Selector */}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 32, scrollbarWidth: 'none' }}>
          {next7Days.map((date, i) => {
            const dateStr = date.toISOString().split('T')[0];
            const isSelected = selectedDate === dateStr;
            return (
              <button key={dateStr}
                onClick={() => handleDateSelect(date)}
                style={{
                  minWidth: 72, padding: '12px 8px', borderRadius: 12, border: 'none',
                  cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center',
                  background: isSelected ? 'linear-gradient(135deg, #e50914, #b81d24)' : 'var(--bg-elevated)',
                  color: isSelected ? 'white' : 'var(--text-secondary)',
                  boxShadow: isSelected ? '0 8px 20px rgba(229,9,20,0.3)' : 'none',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, marginBottom: 4 }}>
                  {i === 0 ? 'TODAY' : date.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{date.getDate()}</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>
                  {date.toLocaleDateString('en-IN', { month: 'short' })}
                </div>
              </button>
            );
          })}
        </div>

        {/* Theatre + Show listing */}
        {isLoading ? (
          <Spinner text="Finding shows..." />
        ) : Object.keys(showsByTheatre).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-subtle)' }}>
            <Film size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>No shows available</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Try selecting a different date</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {Object.values(showsByTheatre).map(({ theatre, shows: theatreShows }) => (
              <div key={theatre._id} className="glass-card" style={{ padding: 24 }}>
                {/* Theatre header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(229,9,20,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={20} color="#e50914" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>{theatre.name}</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {theatre.location?.address}, {theatre.location?.city}
                    </p>
                  </div>
                </div>

                {/* Show time buttons */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {theatreShows.map((show) => {
                    const showDate = new Date(show.showTime);
                    const availableCount = show.seats
                      ? Object.values(show.seats instanceof Map ? Object.fromEntries(show.seats) : show.seats)
                          .filter((s) => s === 'available').length
                      : 0;

                    return (
                      <button key={show._id}
                        id={`show-${show._id}`}
                        onClick={() => handleShowClick(show)}
                        style={{
                          background: 'var(--bg-elevated)', border: '1.5px solid var(--border-medium)',
                          borderRadius: 12, padding: '12px 20px', cursor: 'pointer',
                          transition: 'all 0.2s', textAlign: 'left',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#e50914'; e.currentTarget.style.background = 'rgba(229,9,20,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                      >
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'white', marginBottom: 4 }}>
                          {showDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                          Screen {show.screenNumber}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>₹{show.ticketPrice}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</span>
                          <span style={{ fontSize: 11, color: availableCount > 10 ? '#4ade80' : '#fbbf24' }}>
                            {availableCount} left
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
