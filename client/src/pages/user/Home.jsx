import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMovies, selectMovies, selectMoviesLoading } from '../../redux/slices/movieSlice';
import MovieCard from '../../components/user/MovieCard';
import Spinner from '../../components/common/Spinner';
import { Search, Film, Sparkles } from 'lucide-react';

const GENRES = ['Action', 'Drama', 'Comedy', 'Thriller', 'Horror', 'Romance', 'Sci-Fi', 'Animation'];

export default function Home() {
  const dispatch = useDispatch();
  const movies = useSelector(selectMovies);
  const isLoading = useSelector(selectMoviesLoading);

  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      dispatch(fetchMovies({ search, genre: selectedGenre }));
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [search, selectedGenre, dispatch]);

  const handleSearchChange = (e) => setSearch(e.target.value);

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(229,9,20,0.12) 0%, rgba(10,10,15,0) 100%)',
        padding: '60px 24px 40px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -60, left: '20%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(229,9,20,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -40, right: '15%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(229,9,20,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: 700, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
            <Sparkles size={20} color="#e50914" />
            <span style={{ fontSize: 14, color: '#e50914', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase' }}>
              Now Showing
            </span>
            <Sparkles size={20} color="#e50914" />
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, color: 'white', marginBottom: 16, lineHeight: 1.1 }}>
            Book Your Next{' '}
            <span className="gradient-text">Cinematic Experience</span>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto 32px' }}>
            Discover movies, pick your seats, and enjoy the show. Instant booking, zero hassle.
          </p>

          {/* Search Bar */}
          <div style={{ position: 'relative', maxWidth: 500, margin: '0 auto' }}>
            <Search size={18} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="home-search"
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search movies by title or genre..."
              className="input-field"
              style={{
                paddingLeft: 50, height: 52, fontSize: 15, width: '100%',
                background: 'rgba(30,30,42,0.8)', backdropFilter: 'blur(12px)',
                border: '1.5px solid rgba(229,9,20,0.3)',
                boxShadow: '0 0 30px rgba(229,9,20,0.1)',
                color: 'white', transition: 'all 0.3s ease', outline: 'none'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#e50914'; e.target.style.boxShadow = '0 0 40px rgba(229,9,20,0.4)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(229,9,20,0.3)'; e.target.style.boxShadow = '0 0 30px rgba(229,9,20,0.1)'; }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px 60px' }}>
        {/* Genre Filters */}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 32, scrollbarWidth: 'none' }}>
          <button
            id="genre-all"
            onClick={() => setSelectedGenre('')}
            style={{
              padding: '8px 20px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all 0.2s',
              background: !selectedGenre ? 'linear-gradient(135deg, #e50914, #b81d24)' : 'var(--bg-elevated)',
              color: 'white', border: !selectedGenre ? 'none' : '1px solid var(--border-subtle)',
            }}
          >
            All Movies
          </button>
          {GENRES.map((genre) => (
            <button
              key={genre}
              id={`genre-${genre.toLowerCase()}`}
              onClick={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
              style={{
                padding: '8px 20px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all 0.2s',
                background: selectedGenre === genre ? 'linear-gradient(135deg, #e50914, #b81d24)' : 'var(--bg-elevated)',
                color: selectedGenre === genre ? 'white' : 'var(--text-secondary)',
                border: selectedGenre === genre ? 'none' : '1px solid var(--border-subtle)',
              }}
            >
              {genre}
            </button>
          ))}
        </div>

        {/* Results Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Film size={20} color="#e50914" />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>
              {search || selectedGenre ? 'Search Results' : 'All Movies'}
            </h2>
            {!isLoading && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: 20 }}>
                {movies.length} films
              </span>
            )}
          </div>
        </div>

        {/* Movie Grid */}
        {isLoading ? (
          <Spinner text="Loading movies..." />
        ) : movies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
            <Film size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontSize: 18, fontWeight: 600 }}>No movies found</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>Try a different search or genre filter</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 24,
          }}>
            {movies.map((movie) => (
              <MovieCard key={movie._id} movie={movie} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
