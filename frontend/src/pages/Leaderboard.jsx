import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Avatar from '../components/Avatar';
import StreakBadge from '../components/StreakBadge';

function LeaderboardRow({ entry, currentUserId }) {
  const isMe = entry.id === currentUserId;
  return (
    <div
      className="leaderboard-row"
      style={isMe ? { background: 'var(--accent-dim)', borderRadius: 8 } : {}}
    >
      <div className={`rank-num rank-${entry.rank}`}>
        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
      </div>
      <Link to={`/profile/${entry.username}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
        <Avatar user={entry} size="sm" />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.display_name} {isMe && <span style={{ color: 'var(--accent)', fontSize: 12 }}>(you)</span>}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{entry.username}</div>
        </div>
      </Link>
      <div style={{ textAlign: 'right' }}>
        <StreakBadge streak={entry.max_streak || entry.streak || 0} />
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
          {(entry.total_logs || 0)} total logs
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [tab, setTab] = useState('friends');
  const [data, setData] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [challengeData, setChallengeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dialed_user'))?.id; } catch { return null; }
  });

  useEffect(() => {
    setLoading(true);
    if (tab === 'friends') {
      api.get('/leaderboard/friends').then(r => setData(r.data)).finally(() => setLoading(false));
    } else if (tab === 'global') {
      api.get('/leaderboard/global').then(r => setData(r.data)).finally(() => setLoading(false));
    } else if (tab === 'clubs') {
      api.get('/leaderboard/challenges').then(r => {
        setChallenges(r.data);
        if (r.data.length > 0) setSelectedChallenge(r.data[0].id);
      }).finally(() => setLoading(false));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'clubs' && selectedChallenge) {
      setLoading(true);
      api.get(`/leaderboard/challenges/${selectedChallenge}`)
        .then(r => setChallengeData(r.data))
        .finally(() => setLoading(false));
    }
  }, [selectedChallenge, tab]);

  const list = tab === 'clubs' ? (challengeData?.members || []) : data;

  return (
    <div>
      <div className="feed-header">
        <div className="feed-title">Leaderboard</div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}>Friends</button>
        <button className={`tab-btn ${tab === 'clubs' ? 'active' : ''}`} onClick={() => setTab('clubs')}>Clubs</button>
        <button className={`tab-btn ${tab === 'global' ? 'active' : ''}`} onClick={() => setTab('global')}>Global</button>
      </div>

      {tab === 'clubs' && challenges.length > 0 && (
        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <select
            className="select"
            value={selectedChallenge || ''}
            onChange={e => setSelectedChallenge(e.target.value)}
            style={{ maxWidth: 320, fontSize: 14 }}
          >
            {challenges.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {challengeData && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              {challengeData.challenge?.description}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">🏆</div>
          <h3>No data yet</h3>
          <p>
            {tab === 'friends' ? 'Follow people to see them here.' :
             tab === 'clubs' ? 'Join a club to appear here.' :
             'Start logging habits to rank up.'}
          </p>
        </div>
      ) : (
        <div style={{ padding: '8px 0' }}>
          {list.map(entry => (
            <LeaderboardRow key={entry.id} entry={entry} currentUserId={userId} />
          ))}
        </div>
      )}
    </div>
  );
}
