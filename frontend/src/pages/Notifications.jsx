import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Avatar from '../components/Avatar';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NOTIF_ICONS = {
  follow: '👤',
  like: '🧡',
  comment: '💬',
  badge: '🏅',
  reminder: '⏰',
  challenge_join: '⚡',
  challenge_invite: '📨',
};

const NOTIF_TEXT = {
  follow: name => `${name} started following you`,
  like: name => `${name} liked your post`,
  comment: name => `${name} commented on your post`,
  badge: () => null,
  reminder: () => null,
  challenge_join: (name, msg) => `${name} ${msg}`,
  challenge_invite: (name, msg) => `${name} ${msg}`,
};

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/notifications').then(r => {
      setNotifications(r.data.notifications);
    }).finally(() => setLoading(false));

    // Mark all as read after viewing
    setTimeout(() => api.put('/notifications/read').catch(() => {}), 2000);
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      <div className="feed-header">
        <div className="feed-title">Notifications</div>
      </div>

      <div style={{ padding: '8px 0' }}>
        {notifications.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🔔</div>
            <h3>All caught up</h3>
            <p>You're up to date. Notifications will appear here.</p>
          </div>
        ) : (
          notifications.map(n => {
            const textFn = NOTIF_TEXT[n.type];
            const text = textFn
              ? textFn(n.from_display_name || n.from_username || '', n.message)
              : n.message;

            const isPostNotif = (n.type === 'like' || n.type === 'comment') && n.post_id;
            const bodyHref = isPostNotif ? '/' : (n.from_username ? `/profile/${n.from_username}` : null);

            return (
              <div
                key={n.id}
                className={`notif-item ${!n.is_read ? 'unread' : ''}`}
                style={{ cursor: 'default' }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{NOTIF_ICONS[n.type] || '🔔'}</span>
                {n.from_username ? (
                  <>
                    <Link to={`/profile/${n.from_username}`} style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <Avatar user={{ username: n.from_username, display_name: n.from_display_name, avatar_url: n.from_avatar }} size="sm" />
                    </Link>
                    {bodyHref ? (
                      <Link to={bodyHref} style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}>
                        <p style={{ fontSize: 14, lineHeight: 1.5 }}>{text || n.message}</p>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{timeAgo(n.created_at)}</span>
                      </Link>
                    ) : (
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, lineHeight: 1.5 }}>{text || n.message}</p>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{timeAgo(n.created_at)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, lineHeight: 1.5 }}>{n.message}</p>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{timeAgo(n.created_at)}</span>
                  </div>
                )}
                {!n.is_read && <div className="notif-dot" />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
