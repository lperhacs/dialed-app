import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import HabitCalendar from '../components/HabitCalendar';
import StreakBadge from '../components/StreakBadge';
import { getBadgeInfo } from '../utils/badges';

export default function Profile() {
  const { username } = useParams();
  const { user: me, refresh } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [habits, setHabits] = useState([]);
  const [tab, setTab] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [allBadges, setAllBadges] = useState([]);
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [pinnedBadgeDetail, setPinnedBadgeDetail] = useState(null);
  const [pinning, setPinning] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  const isMe = me?.username === username;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/users/${username}`),
      api.get(`/users/${username}/posts`),
      api.get(`/users/${username}/habits`),
    ]).then(([p, pp, ph]) => {
      setProfile(p.data);
      setPosts(pp.data);
      setHabits(ph.data);
      setFollowing(p.data.is_following);
    }).finally(() => setLoading(false));

    api.get(`/users/${username}/badges`)
      .then(r => { setAllBadges(r.data.all || []); setEarnedBadges(r.data.earned || []); })
      .catch(() => {});
  }, [username]);

  const toggleFollow = async () => {
    setFollowLoading(true);
    try {
      if (following) {
        await api.delete(`/users/${profile.id}/follow`);
        setFollowing(false);
        setProfile(p => ({ ...p, follower_count: p.follower_count - 1 }));
      } else {
        await api.post(`/users/${profile.id}/follow`);
        setFollowing(true);
        setProfile(p => ({ ...p, follower_count: p.follower_count + 1 }));
      }
    } finally {
      setFollowLoading(false);
    }
  };

  const reloadBadges = () => {
    api.get(`/users/${username}/badges`)
      .then(r => {
        setAllBadges(r.data.all || []);
        setEarnedBadges(r.data.earned || []);
        setProfile(p => p ? { ...p, badges: (r.data.earned || []).filter(b => b.pinned).slice(0, 1) } : p);
      })
      .catch(() => {});
  };

  const togglePin = async (badge) => {
    setPinning(badge.id);
    try {
      await api.patch(`/users/profile/badges/${badge.id}/pin`);
      reloadBadges();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update badge');
    } finally {
      setPinning(null);
    }
  };

  const anyAtRisk = habits.some(h => h.at_risk);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!profile) return <div className="empty-state"><h3>User not found</h3></div>;

  return (
    <div>
      <div style={{ padding: '0 0 24px' }}>
        {/* Header */}
        <div className="profile-header">
          <div className="profile-top">
            <Avatar user={profile} size="xl" atRisk={anyAtRisk} />
            <div>
              {isMe ? (
                <button className="btn btn-outline btn-sm" onClick={() => setShowEdit(true)}>Edit Profile</button>
              ) : (
                <button
                  className={`btn ${following ? 'btn-outline' : 'btn-primary'} btn-sm`}
                  onClick={toggleFollow}
                  disabled={followLoading}
                >
                  {following ? 'Unfollow' : 'Follow'}
                </button>
              )}
            </div>
          </div>
          <div>
            <h1 className="profile-name">{profile.display_name}</h1>
            <p className="profile-handle">@{profile.username}</p>
            {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          </div>
          <div className="profile-stats">
            <span className="profile-stat"><strong>{profile.post_count}</strong> posts</span>
            <span className="profile-stat"><strong>{profile.follower_count}</strong> followers</span>
            <span className="profile-stat"><strong>{profile.following_count}</strong> following</span>
          </div>
        </div>

        {/* Pinned badges */}
        {profile.badges?.length > 0 && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 0 4px' }}>
              {profile.badges.map(b => {
                const info = getBadgeInfo(b.badge_type);
                return (
                  <button
                    key={b.id}
                    className="badge-chip"
                    onClick={() => setPinnedBadgeDetail(pinnedBadgeDetail?.id === b.id ? null : b)}
                    style={{ cursor: 'pointer', background: pinnedBadgeDetail?.id === b.id ? 'var(--accent-dim)' : undefined, borderColor: pinnedBadgeDetail?.id === b.id ? 'var(--accent)' : undefined }}
                  >
                    {info.label}
                  </button>
                );
              })}
            </div>
            {pinnedBadgeDetail && (() => {
              const info = getBadgeInfo(pinnedBadgeDetail.badge_type);
              return (
                <div style={{ padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: 10, borderLeft: '3px solid var(--accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{info.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{info.desc}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPinnedBadgeDetail(null)}>✕</button>
                </div>
              );
            })()}
          </>
        )}


        {/* Tabs */}
        <div className="tabs">
          <button className={`tab-btn ${tab === 'posts' ? 'active' : ''}`} onClick={() => setTab('posts')}>Posts</button>
          <button className={`tab-btn ${tab === 'habits' ? 'active' : ''}`} onClick={() => setTab('habits')}>Habits</button>
          <button className={`tab-btn ${tab === 'badges' ? 'active' : ''}`} onClick={() => { setTab('badges'); setSelectedBadge(null); }}>Badges</button>
        </div>

        {/* Posts tab */}
        {tab === 'posts' && (
          <div>
            {posts.length === 0 ? (
              <div className="empty-state">
                <div className="emoji">📝</div>
                <h3>No posts yet</h3>
                <p>{isMe ? "Share your first post!" : `${profile.display_name} hasn't posted yet.`}</p>
              </div>
            ) : (
              posts.map(p => <PostCard key={p.id} post={p} onDelete={id => setPosts(prev => prev.filter(x => x.id !== id))} />)
            )}
          </div>
        )}

        {/* Habits tab */}
        {tab === 'habits' && (
          <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {habits.length === 0 ? (
              <div className="empty-state">
                <div className="emoji">🎯</div>
                <h3>No active habits</h3>
                <p>{isMe ? "Create a habit to start tracking your streaks." : `${profile.display_name} hasn't created any habits yet.`}</p>
              </div>
            ) : (
              habits.map(h => (
                <div key={h.id} className="card" style={{ borderLeft: `4px solid ${h.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h3 style={{ fontWeight: 700, fontSize: 16 }}>{h.name}</h3>
                        <StreakBadge streak={h.streak} atRisk={h.at_risk} />
                      </div>
                      {h.description && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{h.description}</p>
                      )}
                      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-dim)' }}>
                        <span style={{ textTransform: 'capitalize' }}>{h.frequency}</span>
                        <span>{h.total_logs} total logs</span>
                      </div>
                    </div>
                  </div>
                  <HabitCalendar calendar={[]} color={h.color} compact />
                </div>
              ))
            )}
          </div>
        )}

        {/* Badges tab */}
        {tab === 'badges' && (() => {
          // A badge counts as earned if current streak qualifies OR it exists in the DB (historical award)
          const pool = isMe ? allBadges : allBadges.filter(b => b.earned || earnedBadges.some(e => e.badge_type === b.type));
          const groups = [
            { label: 'Daily',   badges: pool.filter(b => b.type.startsWith('day_') || b.type.startsWith('year_')) },
            { label: 'Weekly',  badges: pool.filter(b => b.type.startsWith('week_')) },
            { label: 'Monthly', badges: pool.filter(b => b.type.startsWith('month_')) },
            { label: 'Other',   badges: pool.filter(b => !b.type.startsWith('day_') && !b.type.startsWith('year_') && !b.type.startsWith('week_') && !b.type.startsWith('month_')) },
          ].filter(g => g.badges.length > 0);

          if (groups.length === 0) {
            return (
              <div className="empty-state">
                <div className="emoji">🏅</div>
                <h3>No badges yet</h3>
                <p>Keep up your streaks to earn badges.</p>
              </div>
            );
          }

          return (
            <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {groups.map(({ label, badges }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {badges.map(b => {
                      const info = getBadgeInfo(b.type);
                      const dbBadge = earnedBadges.find(e => e.badge_type === b.type);
                      const isEarned = b.earned || !!dbBadge;
                      return (
                        <button
                          key={b.type}
                          onClick={() => setSelectedBadge(b)}
                          style={{
                            padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', border: 'none', transition: 'opacity 0.15s',
                            ...(isEarned ? {
                              background: 'var(--accent)',
                              color: 'white',
                              outline: dbBadge?.pinned ? '2px solid white' : 'none',
                              outlineOffset: '-3px',
                            } : {
                              background: 'var(--bg-hover)',
                              color: 'var(--text-dim)',
                              outline: '1px solid var(--border-subtle)',
                              opacity: 0.35,
                            }),
                          }}
                        >
                          {info.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Badge detail popup */}
      {selectedBadge && (() => {
        const info = getBadgeInfo(selectedBadge.type);
        const dbBadge = earnedBadges.find(e => e.badge_type === selectedBadge.type);
        return (
          <div className="modal-overlay" onClick={() => setSelectedBadge(null)}>
            <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 340, width: '100%', padding: '20px 20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{info.label}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedBadge(null)}>✕</button>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{info.desc}</div>
              {(selectedBadge.habit_name || dbBadge?.habit_name) && (
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: selectedBadge.habit_color || dbBadge?.habit_color || 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
                  Earned on {selectedBadge.habit_name || dbBadge?.habit_name}
                </div>
              )}
              {isMe && dbBadge && (
                <button
                  className={`btn btn-sm ${dbBadge.pinned ? 'btn-primary' : 'btn-outline'} `}
                  onClick={() => togglePin(dbBadge)}
                  disabled={pinning === dbBadge.id}
                  style={{ marginTop: 16, width: '100%' }}
                >
                  {pinning === dbBadge.id ? '...' : dbBadge.pinned ? 'Unpin from profile' : 'Pin to profile'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {isMe && showEdit && profile && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setProfile(p => ({ ...p, ...updated }));
            setShowEdit(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function EditProfileModal({ profile, onClose, onSaved }) {
  const { updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [username, setUsername] = useState(profile.username || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleImage = e => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async e => {
    e.preventDefault();
    if (!displayName.trim()) { setError('Display name is required'); return; }
    if (!username.trim()) { setError('Username is required'); return; }
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('display_name', displayName.trim());
      formData.append('username', username.trim().toLowerCase());
      formData.append('bio', bio);
      if (imageFile) formData.append('avatar', imageFile);
      const { data } = await api.put('/users/profile', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateUser?.(data);
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const currentAvatar = imagePreview || (profile.avatar_url ? `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${profile.avatar_url}` : null);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Profile</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 4px' }}>
          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 8 }}>
            <div
              style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}
            >
              {currentAvatar ? (
                <img src={currentAvatar} alt="avatar" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>👤</div>
              )}
              <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--accent)', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, border: '2px solid var(--bg)' }}>📷</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click to change photo</span>
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" required />
          </div>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder="username" required />
          </div>
          <div className="form-group">
            <label className="form-label">Bio</label>
            <textarea className="textarea" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell people about yourself…" maxLength={160} style={{ minHeight: 70 }} />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'right', marginTop: 2 }}>{bio.length}/160</div>
          </div>

          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
