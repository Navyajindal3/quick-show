import React, { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, Film, ToggleLeft, ToggleRight } from 'lucide-react';

const EMPTY_FORM = {
  title: '', description: '', genre: '', language: 'Hindi', duration: '',
  releaseDate: '', posterUrl: '', trailerUrl: '', rating: '', director: '', cast: '',
};

export default function ManageMovies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchMovies = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/movies/admin/all');
      setMovies(data.movies);
    } catch { toast.error('Failed to load movies'); }
    setLoading(false);
  };

  useEffect(() => { fetchMovies(); }, []);

  const openCreate = () => { setForm(EMPTY_FORM); setEditId(null); setShowModal(true); };
  const openEdit = (movie) => {
    setForm({
      ...movie,
      genre: movie.genre?.join(', ') || '',
      cast: movie.cast?.join(', ') || '',
      releaseDate: movie.releaseDate ? movie.releaseDate.split('T')[0] : '',
      rating: movie.rating || '',
    });
    setEditId(movie._id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        genre: form.genre.split(',').map((g) => g.trim()).filter(Boolean),
        cast: form.cast.split(',').map((c) => c.trim()).filter(Boolean),
        duration: Number(form.duration),
        rating: Number(form.rating) || 0,
      };
      if (editId) {
        await api.put(`/movies/${editId}`, payload);
        toast.success('Movie updated!');
      } else {
        await api.post('/movies', payload);
        toast.success('Movie added!');
      }
      setShowModal(false);
      fetchMovies();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
    setSaving(false);
  };

  const handleToggleActive = async (movie) => {
    try {
      await api.put(`/movies/${movie._id}`, { isActive: !movie.isActive });
      toast.success(`Movie ${movie.isActive ? 'deactivated' : 'activated'}`);
      fetchMovies();
    } catch { toast.error('Failed to update status'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this movie? This action cannot be undone.')) return;
    try {
      await api.delete(`/movies/${id}`);
      toast.success('Movie deleted');
      fetchMovies();
    } catch { toast.error('Delete failed'); }
  };

  const InputField = ({ label, name, type = 'text', required, ...rest }) => (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#e50914' }}>*</span>}
      </label>
      <input
        type={type} name={name} value={form[name] || ''}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        required={required} className="input-field" {...rest}
      />
    </div>
  );

  return (
    <AdminLayout>
      <div style={{ padding: '32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>Movies</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{movies.length} total movies</p>
          </div>
          <button id="add-movie-btn" onClick={openCreate} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} /> Add Movie
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Poster', 'Title', 'Genre', 'Duration', 'Language', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movies.map((movie) => (
                    <tr key={movie._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <img src={movie.posterUrl} alt={movie.title}
                          style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 6 }}
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      </td>
                      <td style={{ padding: '12px 16px', color: 'white', fontWeight: 600, maxWidth: 200 }}>
                        <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{movie.title}</p>
                        {movie.director && <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dir: {movie.director}</p>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {movie.genre?.slice(0, 2).map((g) => (
                            <span key={g} className="badge badge-blue" style={{ fontSize: 10 }}>{g}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{movie.duration} min</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{movie.language}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <button onClick={() => handleToggleActive(movie)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {movie.isActive
                            ? <><ToggleRight size={20} color="#4ade80" /><span style={{ fontSize: 11, color: '#4ade80' }}>Active</span></>
                            : <><ToggleLeft size={20} color='#6b7280' /><span style={{ fontSize: 11, color: '#6b7280' }}>Inactive</span></>
                          }
                        </button>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => openEdit(movie)} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <Edit2 size={12} /> Edit
                          </button>
                          <button onClick={() => handleDelete(movie._id)} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(229,9,20,0.1)', border: '1px solid rgba(229,9,20,0.2)', color: '#ff6b6b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {movies.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Film size={32} style={{ margin: '0 auto 8px', opacity: 0.3, display: 'block' }} />
                  No movies yet. Click "Add Movie" to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{editId ? 'Edit Movie' : 'Add New Movie'}</h2>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <InputField label="Movie Title" name="title" required />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Description <span style={{ color: '#e50914' }}>*</span>
                  </label>
                  <textarea name="description" value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    required rows={3} className="input-field" style={{ resize: 'vertical' }} />
                </div>
                <InputField label="Genre (comma-separated)" name="genre" placeholder="Action, Drama" required />
                <InputField label="Language" name="language" required />
                <InputField label="Duration (minutes)" name="duration" type="number" required />
                <InputField label="Release Date" name="releaseDate" type="date" required />
                <div style={{ gridColumn: '1/-1' }}>
                  <InputField label="Poster URL" name="posterUrl" placeholder="https://..." required />
                </div>
                <InputField label="Trailer URL" name="trailerUrl" placeholder="https://youtube.com/..." />
                <InputField label="Rating (0-10)" name="rating" type="number" step="0.1" />
                <InputField label="Director" name="director" />
                <div style={{ gridColumn: '1/-1' }}>
                  <InputField label="Cast (comma-separated)" name="cast" placeholder="Actor 1, Actor 2" />
                </div>
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? 'Saving...' : editId ? 'Update Movie' : 'Add Movie'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
