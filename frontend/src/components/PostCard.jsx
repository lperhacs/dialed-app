import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import Comments from './Comments';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PostCard({ post, onDelete }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(!!post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);

  const toggleLike = async () => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? c - 1 : c + 1);
    try {
      if (wasLiked) {
        const { data } = await api.delete(`/posts/${post.id}/like`);
        setLikeCount(data.like_count);
      } else {
        const { data } = await api.post(`/posts/${post.id}/like`);
        setLikeCount(data.like_count);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(c => wasLiked ? c + 1 : c - 1);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this post?')) return;
    await api.delete(`/posts/${post.id}`);
    onDelete?.(post.id);
  };

  return (
    <article className="post-card">
      <div className="post-header">
        <Link to={`/profile/${post.username}`}>
          <Avatar user={{ username: post.username, display_name: post.display_name, avatar_url: post.avatar_url }} size="md" />
        </Link>
        <div className="post-user-info">
          <Link to={`/profile/${post.username}`} className="post-display-name">{post.display_name}</Link>
          <div className="post-username">@{post.username}</div>
        </div>
        <span className="post-time">{timeAgo(post.created_at)}</span>
        {user?.id === post.user_id && (
          <button className="btn btn-ghost btn-sm" onClick={handleDelete} title="Delete">✕</button>
        )}
      </div>

      {post.habit_name && (
        <div
          className="post-habit-tag"
          style={{
            color: post.habit_color || 'var(--accent)',
            borderColor: post.habit_color || 'var(--accent)',
            background: `${post.habit_color || '#f97316'}18`,
          }}
        >
          🔥 Day {post.habit_day} · {post.habit_name}
        </div>
      )}

      <p className="post-content">{post.content}</p>

      {post.image_url && (
        <img src={post.image_url} alt="Post" className="post-image" loading="lazy" />
      )}
      {post.video_url && (
        <div className="mt-12">
          <iframe
            src={post.video_url}
            style={{ width: '100%', borderRadius: 8, border: 'none', aspectRatio: '16/9' }}
            allowFullScreen
            title="Video"
          />
        </div>
      )}

      <div className="post-actions">
        <button className={`action-btn ${liked ? 'liked' : ''}`} onClick={toggleLike}>
          <span>{liked ? '🧡' : '🤍'}</span>
          <span className="action-label">{likeCount}</span>
        </button>
        <button
          className={`action-btn ${showComments ? 'active' : ''}`}
          onClick={() => setShowComments(v => !v)}
        >
          <span>🗨</span>
          <span className="action-label">{commentCount}</span>
        </button>
        <button className="action-btn" onClick={() => navigator.clipboard?.writeText(window.location.origin + `/profile/${post.username}`)}>
          🔗
        </button>
      </div>

      {showComments && (
        <Comments
          postId={post.id}
          onCountChange={setCommentCount}
        />
      )}
    </article>
  );
}
