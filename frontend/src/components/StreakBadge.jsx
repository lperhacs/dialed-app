import React from 'react';

const MILESTONES = [
  { days: 100, emoji: '💯', label: 'Century' },
  { days: 30, emoji: '💪', label: 'Iron Will' },
  { days: 14, emoji: '🚀', label: 'On Fire' },
  { days: 7, emoji: '🔥', label: 'Week Warrior' },
  { days: 1, emoji: '⚡', label: 'Active' },
];

export default function StreakBadge({ streak = 0, atRisk = false, showLabel = false }) {
  if (streak === 0 && !atRisk) return null;

  const milestone = MILESTONES.find(m => streak >= m.days) || MILESTONES[MILESTONES.length - 1];

  return (
    <span className={`streak-badge ${atRisk ? 'at-risk' : ''}`}>
      {atRisk ? '⚠️' : milestone.emoji}
      {' '}
      {streak > 0 ? `${streak}d` : ''}
      {atRisk && ' at risk'}
      {showLabel && !atRisk && ` · ${milestone.label}`}
    </span>
  );
}
