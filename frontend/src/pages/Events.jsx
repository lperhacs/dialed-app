import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';

function formatEventDate(d) {
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function EventCard({ event, onRsvp, onDelete, currentUser }) {
  const [loading, setLoading] = useState(false);
  const [goingCount, setGoingCount] = useState(event.going_count);
  const [myStatus, setMyStatus] = useState(event.my_status);
  const isGoing = myStatus === 'going';
  const isOwner = event.creator_id === currentUser?.id;

  const handleRsvp = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/events/${event.id}/rsvp`);
      setMyStatus(data.status);
      setGoingCount(c => data.status === 'going' ? c + 1 : c - 1);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this event?')) return;
    try {
      await api.delete(`/events/${event.id}`);
      onDelete(event.id);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  return (
    <div className="challenge-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, paddingRight: 16 }}>
          <div className="challenge-name">{event.title}</div>
          <div className="challenge-meta">
            by @{event.username} · 📅 {formatEventDate(event.event_date)}
            {event.location && <> · 📍 {event.location}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <button
            className={`btn btn-sm ${isGoing ? 'btn-outline' : 'btn-primary'}`}
            onClick={handleRsvp}
            disabled={loading}
          >
            {isGoing ? '✓ Going' : 'RSVP'}
          </button>
          {isOwner && (
            <button className="btn btn-sm btn-ghost" onClick={handleDelete} title="Delete event">✕</button>
          )}
        </div>
      </div>
      {event.description && <p className="challenge-desc">{event.description}</p>}
      <div className="challenge-stats">
        <span className="challenge-stat"><strong>{goingCount}</strong> going</span>
        {!event.is_public && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>🔒 Friends only</span>}
      </div>
    </div>
  );
}

function CreateEventModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_date: '',
    location: '',
    is_public: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/events', form);
      onSave(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Create Event</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="input" value={form.title} onChange={set('title')} placeholder="Morning run at the park" required />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="textarea" value={form.description} onChange={set('description')} placeholder="What's happening? Anyone can join!" />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Date</label>
              <input className="input" type="date" value={form.event_date} onChange={set('event_date')} required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Location (optional)</label>
              <input className="input" value={form.location} onChange={set('location')} placeholder="Central Park, NYC" />
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_public}
                onChange={e => setForm(p => ({ ...p, is_public: e.target.checked }))}
              />
              <span className="form-label" style={{ margin: 0 }}>Public (anyone can join)</span>
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.get('/events')
      .then(r => setEvents(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = id => setEvents(prev => prev.filter(e => e.id !== id));

  return (
    <div>
      <div className="feed-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="feed-title">Events</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Create</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📅</div>
            <h3>No upcoming events</h3>
            <p>Post an event and let others join in!</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create an Event</button>
          </div>
        ) : (
          events.map(e => (
            <EventCard key={e.id} event={e} onDelete={handleDelete} currentUser={user} />
          ))
        )}
      </div>

      {showCreate && (
        <CreateEventModal
          onSave={e => setEvents(prev => [e, ...prev])}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
