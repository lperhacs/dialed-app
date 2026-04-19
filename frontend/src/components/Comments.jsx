import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import MentionDropdown from './MentionDropdown';
import useMentionInput from '../hooks/useMentionInput';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function CommentItem({ comment, postId, onDelete }) {
  const { user } = useAuth();
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const { suggestions: replySuggestions, onChange: onReplyMentionChange, pickMention: pickReplyMention } = useMentionInput(replyText, setReplyText);
  const [replies, setReplies] = useState(comment.replies || []);
  const [submitting, setSubmitting] = useState(false);
  const [liked, setLiked] = useState(!!comment.liked_by_me);
  const [likeCount, setLikeCount] = useState(comment.like_count || 0);

  const toggleLike = async () => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? c - 1 : c + 1);
    try {
      if (wasLiked) {
        const { data } = await api.delete(`/posts/${postId}/comments/${comment.id}/like`);
        setLikeCount(data.like_count);
      } else {
        const { data } = await api.post(`/posts/${postId}/comments/${comment.id}/like`);
        setLikeCount(data.like_count);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(c => wasLiked ? c + 1 : c - 1);
    }
  };

  const submitReply = async e => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/posts/${postId}/comments`, { content: replyText, parent_id: comment.id });
      setReplies(r => [...r, data]);
      setReplyText('');
      setShowReply(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <Link to={`/profile/${comment.username}`}>
        <Avatar user={comment} size="sm" />
      </Link>
      <div style={{ flex: 1 }}>
        <div style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link to={`/profile/${comment.username}`} style={{ fontWeight: 700, fontSize: 13 }}>{comment.display_name}</Link>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{timeAgo(comment.created_at)}</span>
            {user?.id === comment.user_id && (
              <button
                onClick={() => onDelete(comment.id)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}
              >✕</button>
            )}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>{comment.content}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4, marginLeft: 4 }}>
          <button
            onClick={() => setShowReply(v => !v)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px' }}
          >
            Reply
          </button>
          <button
            onClick={toggleLike}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
              display: 'flex', alignItems: 'center', gap: 3,
              color: liked ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: 600,
            }}
          >
            {liked ? '🧡' : '🤍'} {likeCount > 0 && likeCount}
          </button>
        </div>

        {replies.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8, borderLeft: '2px solid var(--border-subtle)' }}>
            {replies.map(r => (
              <div key={r.id} style={{ display: 'flex', gap: 8 }}>
                <Link to={`/profile/${r.username}`}>
                  <Avatar user={r} size="sm" />
                </Link>
                <div style={{ flex: 1 }}>
                  <div style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: '6px 10px' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                      <Link to={`/profile/${r.username}`} style={{ fontWeight: 700, fontSize: 12 }}>{r.display_name}</Link>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{timeAgo(r.created_at)}</span>
                    </div>
                    <p style={{ fontSize: 13 }}>{r.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showReply && (
          <form onSubmit={submitReply} style={{ marginTop: 8 }}>
            <MentionDropdown suggestions={replySuggestions} onSelect={pickReplyMention} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={replyText}
                onChange={e => onReplyMentionChange(e.target.value)}
                placeholder="Write a reply..."
                style={{ flex: 1, padding: '6px 12px', fontSize: 13 }}
                autoFocus
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>Reply</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Comments({ postId, onCountChange }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const { suggestions: mentionSuggestions, onChange: onMentionChange, pickMention } = useMentionInput(text, setText);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/posts/${postId}/comments`)
      .then(r => { setComments(r.data); onCountChange?.(r.data.length); })
      .finally(() => setLoading(false));
  }, [postId]);

  const submit = async e => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/posts/${postId}/comments`, { content: text });
      setComments(c => [...c, { ...data, like_count: 0, liked_by_me: false }]);
      onCountChange?.(comments.length + 1);
      setText('');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async id => {
    await api.delete(`/posts/${postId}/comments/${id}`);
    setComments(c => c.filter(x => x.id !== id));
  };

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 12, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <form onSubmit={submit}>
        <MentionDropdown suggestions={mentionSuggestions} onSelect={pickMention} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Avatar user={user} size="sm" />
          <input
            className="input"
            value={text}
            onChange={e => onMentionChange(e.target.value)}
            placeholder="Add a comment..."
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={submitting || !text.trim()}>Post</button>
        </div>
      </form>

      {loading ? (
        <div className="loading-center" style={{ padding: 20 }}><div className="spinner" /></div>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0' }}>No comments yet. Be the first!</p>
      ) : (
        comments.map(c => (
          <CommentItem key={c.id} comment={c} postId={postId} onDelete={deleteComment} />
        ))
      )}
    </div>
  );
}
