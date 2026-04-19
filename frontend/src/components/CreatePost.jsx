import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import MentionDropdown from './MentionDropdown';
import useMentionInput from '../hooks/useMentionInput';

export default function CreatePost({ onPost }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const { suggestions: mentionSuggestions, onChange: onMentionChange, pickMention } = useMentionInput(content, setContent);
  const [videoUrl, setVideoUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [habitId, setHabitId] = useState('');
  const [habitDay, setHabitDay] = useState('');
  const [habits, setHabits] = useState([]);
  const [showHabits, setShowHabits] = useState(false);
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/habits').then(r => setHabits(r.data.filter(h => h.is_active))).catch(() => {});
  }, []);

  const handleImage = e => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!content.trim() && !imageFile && !videoUrl) {
      setError('Post something!');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('content', content);
      if (imageFile) formData.append('image', imageFile);
      if (videoUrl) formData.append('video_url', videoUrl);
      if (habitId) formData.append('habit_id', habitId);
      if (habitDay) formData.append('habit_day', habitDay);

      const { data } = await api.post('/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onPost?.(data);
      setContent('');
      setVideoUrl('');
      setImageFile(null);
      setImagePreview('');
      setHabitId('');
      setHabitDay('');
      setShowHabits(false);
      setShowVideoInput(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedHabit = habits.find(h => h.id === habitId);

  return (
    <form onSubmit={handleSubmit} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Avatar user={user} />
        <div style={{ flex: 1 }}>
          <MentionDropdown suggestions={mentionSuggestions} onSelect={pickMention} />
          <textarea
            className="textarea"
            value={content}
            onChange={e => onMentionChange(e.target.value)}
            placeholder="What are you dialed into today?"
            style={{ border: 'none', background: 'transparent', padding: '4px 0', fontSize: 16, minHeight: 60, resize: 'none' }}
            maxLength={500}
          />

          {/* Habit button — sits right below the input */}
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setShowHabits(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: showHabits || selectedHabit ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                background: showHabits || selectedHabit ? 'var(--accent-dim)' : 'transparent',
                color: showHabits || selectedHabit ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              🔥 {selectedHabit ? selectedHabit.name : 'Tag a habit'}
            </button>
            {selectedHabit && (
              <button type="button" onClick={() => { setHabitId(''); setHabitDay(''); }} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>✕</button>
            )}
          </div>

          {showHabits && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, padding: 12, background: 'var(--bg-hover)', borderRadius: 8 }}>
              {habits.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No active habits yet.</p>
              ) : habits.map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => { setHabitId(h.id); setShowHabits(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                    background: habitId === h.id ? 'var(--accent-dim)' : 'transparent',
                    border: habitId === h.id ? '1px solid var(--accent)' : '1px solid transparent',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: h.color, display: 'inline-block', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{h.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.streak}d streak</div>
                  </div>
                </button>
              ))}
              {selectedHabit && (
                <input
                  className="input"
                  type="number"
                  min="1"
                  placeholder="Day # (optional)"
                  value={habitDay}
                  onChange={e => setHabitDay(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              )}
            </div>
          )}

          {imagePreview && (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <img src={imagePreview} alt="Preview" style={{ borderRadius: 8, maxHeight: 240, objectFit: 'cover', width: '100%' }} />
              <button
                type="button"
                onClick={() => { setImageFile(null); setImagePreview(''); }}
                style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}
              >✕</button>
            </div>
          )}

          {showVideoInput && (
            <input
              className="input"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="Video embed URL (YouTube, Vimeo...)"
              style={{ marginBottom: 12 }}
            />
          )}

          {error && <p className="form-error mb-8">{error}</p>}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }} title="Add image">
                📷
                <input type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
              </label>
              <button
                type="button"
                className={`btn btn-ghost btn-sm${showVideoInput ? ' text-accent' : ''}`}
                onClick={() => setShowVideoInput(v => !v)}
                title="Add video"
              >
                🎥 Video
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{content.length}/500</span>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submitting || (!content.trim() && !imageFile && !videoUrl)}
              >
                {submitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
