import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { getBadgeInfo } from '../utils/badges';

export default function BadgeModal({ username, isMe, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pinning, setPinning] = useState(null);

  const load = () => {
    api.get(`/users/${username}/badges`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [username]);

  const togglePin = async (badge) => {
    setPinning(badge.id);
    try {
      await api.patch(`/users/profile/badges/${badge.id}/pin`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update badge');
    } finally {
      setPinning(null);
    }
  };

  const earned = data?.earned || [];
  const all = data?.all || [];
  const locked = all.filter(b => !b.earned);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 16px' }}>
          <h2 style={{ fontWeight: 800, fontSize: 20 }}>Badges</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px 20px' }}>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : (
            <>
              {earned.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
                    Earned · {earned.length}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {earned.map(b => {
                      const info = getBadgeInfo(b.badge_type);
                      return (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: 10, border: b.pinned ? '1px solid var(--accent)' : '1px solid transparent' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{info.label}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{info.desc}</div>
                            {b.habit_name && (
                              <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: b.habit_color || 'var(--accent)', display: 'inline-block' }} />
                                <span style={{ color: 'var(--text-dim)' }}>{b.habit_name}</span>
                              </div>
                            )}
                          </div>
                          {isMe && (
                            <button
                              className={`btn btn-sm ${b.pinned ? 'btn-primary' : 'btn-outline'}`}
                              onClick={() => togglePin(b)}
                              disabled={pinning === b.id}
                              style={{ minWidth: 64 }}
                            >
                              {b.pinned ? 'Pinned' : 'Pin'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {locked.length > 0 && (
                <section>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
                    Locked · {locked.length}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {locked.map(b => (
                      <div key={b.type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: 10, opacity: 0.4 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{b.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{b.desc}</div>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Locked</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {earned.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No badges earned yet.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
