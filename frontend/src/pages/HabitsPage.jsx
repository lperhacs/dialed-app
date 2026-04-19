import React, { useState, useEffect } from 'react';
import api from '../api/client';
import HabitCalendar from '../components/HabitCalendar';
import StreakBadge from '../components/StreakBadge';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6'];

function HabitCard({ habit, onLog, onDelete, onEdit }) {
  const [logging, setLogging] = useState(false);

  const handleLog = async () => {
    setLogging(true);
    try {
      const { data } = await api.post(`/habits/${habit.id}/log`, { note: '' });
      onLog(habit.id, data);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not log habit');
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="card" style={{ borderLeft: `4px solid ${habit.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>{habit.name}</h3>
            <StreakBadge streak={habit.streak} atRisk={habit.at_risk} />
          </div>
          {habit.description && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{habit.description}</p>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: 'var(--text-dim)' }}>
            <span style={{ textTransform: 'capitalize' }}>{habit.frequency}</span>
            <span>{habit.total_logs} total logs</span>
            <span style={{ textTransform: 'capitalize' }}>Missed: {habit.visibility_missed}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(habit)}>✏️</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onDelete(habit.id)}>🗑️</button>
        </div>
      </div>

      <HabitCalendar calendar={habit.calendar} color={habit.color} />

      <div style={{ marginTop: 14 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleLog}
          disabled={logging}
          style={{ background: habit.color, borderColor: habit.color }}
        >
          {logging ? 'Logging...' : `✓ Log ${habit.frequency === 'daily' ? 'Today' : habit.frequency === 'weekly' ? 'This Week' : 'This Month'}`}
        </button>
      </div>
    </div>
  );
}

function HabitModal({ habit, onSave, onClose }) {
  const [form, setForm] = useState({
    name: habit?.name || '',
    description: habit?.description || '',
    frequency: habit?.frequency || 'daily',
    visibility_missed: habit?.visibility_missed || 'public',
    color: habit?.color || '#f97316',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = f => e => setForm(prev => ({ ...prev, [f]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (habit) {
        const { data } = await api.put(`/habits/${habit.id}`, form);
        onSave(data, false);
      } else {
        const { data } = await api.post('/habits', form);
        onSave(data, true);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{habit ? 'Edit Habit' : 'New Habit'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Habit Name</label>
            <input className="input" value={form.name} onChange={set('name')} placeholder="Morning Run" required />
          </div>
          <div className="form-group">
            <label className="form-label">Description (optional)</label>
            <textarea className="textarea" value={form.description} onChange={set('description')} placeholder="What does this habit involve?" style={{ minHeight: 60 }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Frequency</label>
              <select className="select" value={form.frequency} onChange={set('frequency')}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Missed Days</label>
              <select className="select" value={form.visibility_missed} onChange={set('visibility_missed')}>
                <option value="public">Public</option>
                <option value="friends">Friends Only</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Color</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                    outline: form.color === c ? `3px solid white` : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : habit ? 'Save Changes' : 'Create Habit'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function HabitsPage() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editHabit, setEditHabit] = useState(null);

  useEffect(() => {
    api.get('/habits').then(r => setHabits(r.data)).finally(() => setLoading(false));
  }, []);

  const handleLog = (habitId, data) => {
    setHabits(prev => prev.map(h =>
      h.id === habitId
        ? { ...h, streak: data.streak, at_risk: data.at_risk, total_logs: data.total_logs }
        : h
    ));
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this habit? All logs will be lost.')) return;
    await api.delete(`/habits/${id}`);
    setHabits(prev => prev.filter(h => h.id !== id));
  };

  const handleEdit = habit => { setEditHabit(habit); setShowModal(true); };

  const handleSave = (habit, isNew) => {
    if (isNew) {
      setHabits(prev => [{ ...habit, calendar: [], streak: 0, at_risk: false, total_logs: 0 }, ...prev]);
    } else {
      setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, ...habit } : h));
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      <div className="feed-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="feed-title">My Habits</div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => { setEditHabit(null); setShowModal(true); }}
        >
          + New Habit
        </button>
      </div>

      <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {habits.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🎯</div>
            <h3>No habits yet</h3>
            <p>Create your first habit and start building your streak. The hardest part is starting.</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>Create Your First Habit</button>
          </div>
        ) : (
          habits.map(h => (
            <HabitCard key={h.id} habit={h} onLog={handleLog} onDelete={handleDelete} onEdit={handleEdit} />
          ))
        )}
      </div>

      {showModal && (
        <HabitModal
          habit={editHabit}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditHabit(null); }}
        />
      )}
    </div>
  );
}
