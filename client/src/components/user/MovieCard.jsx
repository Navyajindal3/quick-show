import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Clock, Globe } from 'lucide-react';

/**
 * Movie card for the home page grid.
 * Displays poster, title, genre, rating, and duration.
 */
export default function MovieCard({ movie }) {
  const { _id, title, posterUrl, genre, rating, duration, language } = movie;

  return (
    <Link to={`/movies/${_id}`} style={{ textDecoration: 'none' }}>
      <div className="movie-card hover-lift animate-fade-in" style={{ position: 'relative' }}>
        {/* Poster */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <img
            src={posterUrl}
            alt={title}
            style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }}
            onError={(e) => {
              e.target.src = `https://placehold.co/300x450/1a1a2e/e50914?text=${encodeURIComponent(title)}`;
            }}
          />
          {/* Overlay on hover */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 60%)',
          }} />
          {/* Rating badge */}
          {rating > 0 && (
            <div style={{
              position: 'absolute', top: 10, right: 10,
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
              borderRadius: 8, padding: '4px 8px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <Star size={12} color="#fbbf24" fill="#fbbf24" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                {rating.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: '14px 16px 16px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 8, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </h3>

          {/* Genre badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {genre?.slice(0, 2).map((g) => (
              <span key={g} className="badge badge-red" style={{ fontSize: 10 }}>{g}</span>
            ))}
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} /> {duration} min
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Globe size={11} /> {language}
            </span>
          </div>

          {/* Book Now */}
          <div style={{
            marginTop: 14,
            background: 'linear-gradient(135deg, #e50914, #b81d24)',
            borderRadius: 8, padding: '8px 0', textAlign: 'center',
            fontSize: 13, fontWeight: 700, color: 'white',
            letterSpacing: 0.5,
          }}>
            Book Now
          </div>
        </div>
      </div>
    </Link>
  );
}
