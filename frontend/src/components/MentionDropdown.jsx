import React from 'react';

export default function MentionDropdown({ suggestions, onSelect }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 6,
    }}>
      {suggestions.map(u => (
        <button
          key={u.id}
          type="button"
          onMouseDown={e => { e.preventDefault(); onSelect(u.username); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '8px 12px',
            background: 'none', border: 'none',
            borderBottom: '1px solid var(--border-subtle)',
            cursor: 'pointer', textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{u.display_name}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{u.username}</span>
        </button>
      ))}
    </div>
  );
}
