import React, { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, Building2, MapPin } from 'lucide-react';

const EMPTY_FORM = {
  name: '',
  'location.address': '',
  'location.city': '',
  'location.state': '',
  screens: [{ screenNumber: 1, totalSeats: 60 }],
};

export default function ManageTheatres() {
  const [theatres, setTheatres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchTheatres = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/theatres/admin/all');
      setTheatres(data.theatres);
    } catch { toast.error('Failed to load theatres'); }
    setLoading(false);
  };

  useEffect(() => { fetchTheatres(); }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (theatre) => {
    setForm({
      name: theatre.name,
      'location.address': theatre.location?.address || '',
      'location.city': theatre.location?.city || '',
      'location.state': theatre.location?.state || '',
      screens: theatre.screens?.length > 0 ? theatre.screens : [{ screenNumber: 1, totalSeats: 60 }],
    });
    setEditId(theatre._id);
    setShowModal(true);
  };

  const addScreen = () => {
    setForm((prev) => ({
      ...prev,
      screens: [...prev.screens, { screenNumber: prev.screens.length + 1, totalSeats: 60 }],
    }));
  };

  const removeScreen = (idx) => {
    setForm((prev) => ({ ...prev, screens: prev.screens.filter((_, i) => i !== idx) }));
  };

  const updateScreen = (idx, field, value) => {
    setForm((prev) => {
      const updated = [...prev.screens];
      updated[idx] = { ...updated[idx], [field]: Number(value) };
      return { ...prev, screens: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        location: {
          address: form['location.address'],
          city: form['location.city'],
          state: form['location.state'],
        },
        screens: form.screens,
      };
      if (editId) {
        await api.put(`/theatres/${editId}`, payload);
        toast.success('Theatre updated!');
      } else {
        await api.post('/theatres', payload);
        toast.success('Theatre added!');
      }
      setShowModal(false);
      fetchTheatres();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this theatre?')) return;
    try {
      await api.delete(`/theatres/${id}`);
      toast.success('Theatre deleted');
      fetchTheatres();
    } catch { toast.error('Delete failed'); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>Theatres</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{theatres.length} theatres registered</p>
          </div>
          <button id="add-theatre-btn" onClick={openCreate} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} /> Add Theatre
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {theatres.map((t) => (
              <div key={t._id} className="glass-card hover-lift" style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(96,165,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={20} color="#60a5fa" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{t.name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                        <MapPin size={10} />
                        {t.location?.city}, {t.location?.state}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(t)} style={{ padding: '6px', borderRadius: 8, background: 'rgba(96,165,250,0.1)', border: 'none', color: '#60a5fa', cursor: 'pointer' }}>
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(t._id)} style={{ padding: '6px', borderRadius: 8, background: 'rgba(229,9,20,0.1)', border: 'none', color: '#ff6b6b', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{t.location?.address}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {t.screens?.map((s) => (
                    <div key={s.screenNumber} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                      <span style={{ color: 'white', fontWeight: 600 }}>Screen {s.screenNumber}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{s.totalSeats} seats</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {theatres.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <Building2 size={32} style={{ margin: '0 auto 8px', opacity: 0.3, display: 'block' }} />
                No theatres yet. Click "Add Theatre" to start.
              </div>
            )}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{editId ? 'Edit Theatre' : 'Add Theatre'}</h2>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Theatre Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input-field" placeholder="e.g. PVR Cinemas" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[['Address', 'location.address', '123 Main St'], ['City', 'location.city', 'Mumbai'], ['State', 'location.state', 'Maharashtra']].map(([label, key, placeholder]) => (
                    <div key={key} style={{ gridColumn: label === 'Address' ? '1/-1' : 'auto' }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label} *</label>
                      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required className="input-field" placeholder={placeholder} />
                    </div>
                  ))}
                </div>

                {/* Screens */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Screens</label>
                    <button type="button" onClick={addScreen} style={{ fontSize: 12, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add Screen</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {form.screens.map((screen, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 60 }}>Screen {screen.screenNumber}</span>
                        <input type="number" value={screen.totalSeats}
                          onChange={(e) => updateScreen(idx, 'totalSeats', e.target.value)}
                          placeholder="Total seats" style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'white', fontSize: 13 }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>seats</span>
                        {form.screens.length > 1 && (
                          <button type="button" onClick={() => removeScreen(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b6b' }}><X size={14} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? 'Saving...' : editId ? 'Update Theatre' : 'Add Theatre'}
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
