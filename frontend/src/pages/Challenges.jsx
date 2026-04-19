import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

function formatDate(d) {
  if (!d) return '∞';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ClubCard({ club, onJoin }) {
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(club.joined);
  const [memberCount, setMemberCount] = useState(club.member_count);

  const handleJoin = async e => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      if (joined) {
        await api.delete(`/clubs/${club.id}/leave`);
        setJoined(false);
        setMemberCount(c => c - 1);
      } else {
        await api.post(`/clubs/${club.id}/join`);
        setJoined(true);
        setMemberCount(c => c + 1);
      }
      onJoin?.(club.id, !joined);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const days = club.end_date
    ? Math.ceil((new Date(club.end_date) - Date.now()) / 86400000)
    : null;

  return (
    <Link to={`/clubs/${club.id}`} className="challenge-card" style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, paddingRight: 16 }}>
          <div className="challenge-name">{club.name}</div>
          <div className="challenge-meta">
            by @{club.username} · {club.frequency} ·{' '}
            {days !== null ? (days > 0 ? `${days} days left` : 'Ended') : 'Ongoing'}
          </div>
        </div>
        <button
          className={`btn btn-sm ${joined ? 'btn-outline' : 'btn-primary'}`}
          onClick={handleJoin}
          disabled={loading}
          style={{ flexShrink: 0 }}
        >
          {joined ? 'Leave' : 'Join'}
        </button>
      </div>
      <p className="challenge-desc">{club.description}</p>
      <div className="challenge-stats">
        <span className="challenge-stat"><strong>{memberCount}</strong> members</span>
        <span className="challenge-stat">{formatDate(club.start_date)} → {formatDate(club.end_date)}</span>
        {joined && <span style={{ color: 'var(--green)', fontWeight: 600, fontSize: 12 }}>✓ Joined</span>}
      </div>
    </Link>
  );
}

function CreateClubModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    name: '', description: '', frequency: 'daily',
    start_date: new Date().toISOString().split('T')[0], end_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/clubs', form);
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
          <h2 className="modal-title">Create Club</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Club Name</label>
            <input className="input" value={form.name} onChange={set('name')} placeholder="Morning Run Club" required />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="textarea" value={form.description} onChange={set('description')} placeholder="What's this club about?" />
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
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Start Date</label>
              <input className="input" type="date" value={form.start_date} onChange={set('start_date')} required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">End Date (optional)</label>
              <input className="input" type="date" value={form.end_date} onChange={set('end_date')} />
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create Club'}
          </button>
        </form>
      </div>
    </div>
  );
}

function SuggestedClubCard({ club }) {
  const [status, setStatus] = useState(club.memberStatus);
  const [loading, setLoading] = useState(false);
  const isPrivate = club.visibility === 'private';

  const handleJoin = async e => {
    e.preventDefault();
    e.stopPropagation();
    if (status === 'active' || status === 'pending') return;
    setLoading(true);
    try {
      const { data } = await api.post(`/clubs/${club.id}/join`);
      setStatus(data.memberStatus);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const joinLabel = () => {
    if (loading) return '…';
    if (status === 'active') return '✓ Joined';
    if (status === 'pending') return 'Pending';
    return isPrivate ? 'Request' : 'Join';
  };

  return (
    <Link to={`/clubs/${club.id}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
      <div className="suggested-club-card">
        <div className="suggested-club-name">{club.name}</div>
        <div className="suggested-club-meta">{club.frequency} · {club.member_count} members</div>
        {club.description && (
          <div className="suggested-club-desc">{club.description}</div>
        )}
        <button
          className={`btn btn-sm ${status === 'active' || status === 'pending' ? 'btn-outline' : 'btn-primary'}`}
          onClick={handleJoin}
          disabled={loading || status === 'active' || status === 'pending'}
          style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
        >
          {joinLabel()}
        </button>
      </div>
    </Link>
  );
}

export default function Clubs() {
  const [clubs, setClubs] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      api.get('/clubs'),
      api.get('/clubs/suggested'),
    ]).then(([clubsRes, sugRes]) => {
      if (clubsRes.status === 'fulfilled') setClubs(clubsRes.value.data);
      if (sugRes.status === 'fulfilled') setSuggestions(sugRes.value.data);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="feed-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="feed-title">Clubs</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Create</button>
      </div>

      {!loading && suggestions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span>✦</span> Suggested for you
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {suggestions.map(c => <SuggestedClubCard key={c.id} club={c} />)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : clubs.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">⚡</div>
            <h3>No clubs yet</h3>
            <p>Create the first club and invite friends to join!</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create a Club</button>
          </div>
        ) : (
          clubs.map(c => (
            <ClubCard key={c.id} club={c} />
          ))
        )}
      </div>

      {showCreate && (
        <CreateClubModal
          onSave={c => setClubs(prev => [c, ...prev])}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
