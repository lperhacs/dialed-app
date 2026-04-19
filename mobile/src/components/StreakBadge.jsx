import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

const MILESTONES = [
  { days: 100, label: 'Century' },
  { days: 30,  label: 'Iron Will' },
  { days: 14,  label: 'On Fire' },
  { days: 7,   label: 'Week Warrior' },
  { days: 1,   label: 'Active' },
];

export default function StreakBadge({ streak = 0, atRisk = false, showLabel = false }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  if (streak === 0 && !atRisk) return null;

  const milestone = MILESTONES.find(m => streak >= m.days) || MILESTONES[MILESTONES.length - 1];

  if (atRisk) {
    return (
      <View style={[styles.badge, styles.atRisk]}>
        <Text style={[styles.text, { color: colors.red }]}>at risk</Text>
      </View>
    );
  }

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{streak}d</Text>
      {showLabel && <Text style={[styles.text, { color: colors.textMuted }]}> · {milestone.label}</Text>}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.xs,
      backgroundColor: colors.accentDim,
      borderWidth: 1,
      borderColor: colors.accentDimBorder,
      alignSelf: 'flex-start',
    },
    atRisk: {
      backgroundColor: colors.redDim,
      borderColor: 'rgba(248,113,113,0.2)',
    },
    text: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.accent,
    },
  });
}
