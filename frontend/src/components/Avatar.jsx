import React from 'react';

export default function Avatar({ user, size = 'md', atRisk = false }) {
  const sizeClass = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : size === 'xl' ? 'avatar-xl' : '';
  const riskClass = atRisk ? 'avatar-at-risk' : '';
  const initial = (user?.display_name || user?.username || '?')[0].toUpperCase();

  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.display_name}
        className={`avatar ${sizeClass} ${riskClass}`}
      />
    );
  }

  return (
    <div className={`avatar avatar-placeholder ${sizeClass} ${riskClass}`}>
      {initial}
    </div>
  );
}
