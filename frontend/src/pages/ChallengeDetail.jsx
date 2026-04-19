import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import StreakBadge from '../components/StreakBadge';

function formatDate(d) {
  if (!d) return '∞';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClubDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [habits, setHabits] = useState([]);
  const [linkedHabit, setLinkedHabit] = useState('');
  const [linking, setLinking] = useState(false);
  const [showLinkHabit, setShowLinkHabit] = useState(false);

  useEffect(() => {
    api.get(`/clubs/${id}`).then(r => setClub(r.data)).finally(() => setLoading(false));
    api.get('/habits').then(r => setHabits(r.data.filter(h => h.is_active)));
  }, [id]);

  const toggleJoin = async () => {
    setJoining(true);
    try {
      if (club.joined) {
        await api.delete(`/clubs/${id}/leave`);
        setClub(c => ({ ...c, joined: false, members: c.members.filter(m => m.id !== user.id) }));
      } else {
        await api.post(`/clubs/${id}/join`);
        setClub(c => ({ ...c, joined: true, members: [...c.members, { ...user, streak: 0 }] }));
      }
    } finally {
      setJoining(false);
    }
  };

  const linkHabit = async () => {
    if (!linkedHabit) return;
    setLinking(true);
    try {
      await api.post(`/clubs/${id}/link-habit`, { habit_id: linkedHabit });
      setShowLinkHabit(false);
    } finally {
      setLinking(false);
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!club) return <div className="empty-state"><h3>Club not found</h3></div>;

  const days = club.end_date
    ? Math.ceil((new Date(club.end_date) - Date.now()) / 86400000)
    : null;

  const sortedMembers = [...(club.members || [])].sort((a, b) => b.streak - a.streak);

  return (
    <div>
      <div className="feed-header">
        <Link to="/clubs" style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>← Back</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>{club.name}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              by @{club.username} · {club.frequency} ·{' '}
              {formatDate(club.start_date)} → {formatDate(club.end_date)}
              {days !== null && days > 0 && ` · ${days} days left`}
            </p>
          </div>
          <button
            className={`btn btn-sm ${club.joined ? 'btn-outline' : 'btn-primary'}`}
            onClick={toggleJoin}
            disabled={joining}
          >
            {club.joined ? 'Leave' : 'Join'}
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 0' }}>
        {club.description && (
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 15, lineHeight: 1.6 }}>{club.description}</p>
          </div>
        )}

        {club.joined && (
          <div style={{ marginBottom: 16 }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowLinkHabit(v => !v)}
            >
              🔗 Link My Habit to This Club
            </button>
            {showLinkHabit && (
              <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg-card)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                <select
                  className="select"
                  value={linkedHabit}
                  onChange={e => setLinkedHabit(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Select a habit...</option>
                  {habits.map(h => <option key={h.id} value={h.id}>{h.name} (streak: {h.streak}d)</option>)}
                </select>
                <button className="btn btn-primary btn-sm" onClick={linkHabit} disabled={linking || !linkedHabit}>
                  {linking ? 'Linking...' : 'Link'}
                </button>
              </div>
            )}
          </div>
        )}

        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          Leaderboard · {sortedMembers.length} members
        </h2>

        {sortedMembers.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="emoji">⚡</div>
            <h3>No members yet</h3>
            <p>Be the first to join!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sortedMembers.map((member, i) => (
              <div key={member.id} className="leaderboard-row">
                <div className={`rank-num rank-${i + 1}`}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </div>
                <Link to={`/profile/${member.username}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Avatar user={member} size="sm" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {member.display_name}
                      {member.id === user?.id && <span style={{ color: 'var(--accent)', fontSize: 12 }}> (you)</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{member.username}</div>
                  </div>
                </Link>
                <StreakBadge streak={member.streak} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
