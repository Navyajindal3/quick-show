import React, { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, Clock } from 'lucide-react';

const EMPTY_FORM = {
  movie: '', theatre: '', screenNumber: 1, showTime: '', ticketPrice: '',
};

export default function ManageShows() {
  const [shows, setShows] = useState([]);
  const [movies, setMovies] = useState([]);
  const [theatres, setTheatres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [availableScreens, setAvailableScreens] = useState([]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [s, m, t] = await Promise.all([
        api.get('/shows/admin/all'),
        api.get('/movies/admin/all'),
        api.get('/theatres/admin/all'),
      ]);
      setShows(s.data.shows);
      setMovies(m.data.movies);
      setTheatres(t.data.theatres);
    } catch { toast.error('Failed to load data'); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // When theatre selection changes, update available screens
  useEffect(() => {
    if (form.theatre) {
      const theatre = theatres.find((t) => t._id === form.theatre);
      setAvailableScreens(theatre?.screens || []);
      setForm((prev) => ({ ...prev, screenNumber: theatre?.screens?.[0]?.screenNumber || 1 }));
    }
  }, [form.theatre]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditId(null); setShowModal(true); };
  const openEdit = (show) => {
    setForm({
      movie: show.movie?._id || '',
      theatre: show.theatre?._id || '',
      screenNumber: show.screenNumber,
      showTime: show.showTime ? new Date(show.showTime).toISOString().slice(0, 16) : '',
      ticketPrice: show.ticketPrice,
    });
    setEditId(show._id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, screenNumber: Number(form.screenNumber), ticketPrice: Number(form.ticketPrice) };
      if (editId) {
        await api.put(`/shows/${editId}`, payload);
        toast.success('Show updated!');
      } else {
        await api.post('/shows', payload);
        toast.success('Show scheduled!');
      }
      setShowModal(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this show?')) return;
    try {
      await api.delete(`/shows/${id}`);
      toast.success('Show deleted');
      fetchAll();
    } catch { toast.error('Delete failed'); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>Shows</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{shows.length} scheduled shows</p>
          </div>
          <button id="add-show-btn" onClick={openCreate} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} /> Schedule Show
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Movie', 'Theatre', 'Screen', 'Date & Time', 'Price', 'Booked/Total', 'Actions'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shows.map((show) => {
                  const seatsObj = show.seats instanceof Map ? Object.fromEntries(show.seats) : (show.seats || {});
                  const totalSeats = Object.keys(seatsObj).length;
                  const bookedSeats = Object.values(seatsObj).filter((s) => s === 'booked').length;
                  return (
                    <tr key={show._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', color: 'white', fontWeight: 600 }}>{show.movie?.title}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{show.theatre?.name}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>#{show.screenNumber}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {show.showTime && new Date(show.showTime).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#4ade80', fontWeight: 700 }}>₹{show.ticketPrice}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, maxWidth: 80, height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${totalSeats ? (bookedSeats / totalSeats) * 100 : 0}%`, background: '#e50914', borderRadius: 3, transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{bookedSeats}/{totalSeats}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => openEdit(show)} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(96,165,250,0.1)', border: 'none', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <Edit2 size={12} /> Edit
                          </button>
                          <button onClick={() => handleDelete(show._id)} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(229,9,20,0.1)', border: 'none', color: '#ff6b6b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shows.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Clock size={32} style={{ margin: '0 auto 8px', opacity: 0.3, display: 'block' }} />
                No shows scheduled yet. Click "Schedule Show" to start.
              </div>
            )}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 500 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{editId ? 'Edit Show' : 'Schedule Show'}</h2>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Movie', key: 'movie', options: movies, getLabel: (m) => m.title },
                  { label: 'Theatre', key: 'theatre', options: theatres, getLabel: (t) => `${t.name} - ${t.location?.city}` },
                ].map(({ label, key, options, getLabel }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label} *</label>
                    <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required className="input-field" style={{ cursor: 'pointer' }}>
                      <option value="">Select {label}...</option>
                      {options.map((opt) => (
                        <option key={opt._id} value={opt._id}>{getLabel(opt)}</option>
                      ))}
                    </select>
                  </div>
                ))}

                {availableScreens.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Screen *</label>
                    <select value={form.screenNumber} onChange={(e) => setForm({ ...form, screenNumber: e.target.value })} required className="input-field">
                      {availableScreens.map((s) => (
                        <option key={s.screenNumber} value={s.screenNumber}>Screen {s.screenNumber} ({s.totalSeats} seats)</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Show Date & Time *</label>
                  <input type="datetime-local" value={form.showTime} onChange={(e) => setForm({ ...form, showTime: e.target.value })} required className="input-field" />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Ticket Price (₹) *</label>
                  <input type="number" value={form.ticketPrice} onChange={(e) => setForm({ ...form, ticketPrice: e.target.value })} required min="1" placeholder="200" className="input-field" />
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? 'Saving...' : editId ? 'Update Show' : 'Schedule Show'}
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
