import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const DAY_SIZE = 10;
const DAY_GAP  = 3;

export default function HabitCalendar({ calendar = [], color, compact = false, days, frequency = 'daily' }) {
  const { colors } = useTheme();
  const accentColor = color ?? colors.accent;

  // Convert the `days` range into number of periods to show
  const rawDays = days ?? (compact ? 91 : calendar.length);
  const slicePeriods = useMemo(() => {
    if (frequency === 'weekly')  return Math.ceil(rawDays / 7);
    if (frequency === 'monthly') return Math.ceil(rawDays / 30);
    return rawDays;
  }, [frequency, rawDays]);

  const sliced = useMemo(
    () => calendar.slice(-slicePeriods),
    [calendar, slicePeriods]
  );

  return (
    <View style={styles.grid}>
      {sliced.flatMap((bucket, i) => {
        // Support both new format { key, count, target } and legacy { date, logged }
        const target = bucket.target ?? 1;
        const count  = bucket.count  ?? (bucket.logged ? 1 : 0);
        return Array.from({ length: target }, (_, j) => (
          <View
            key={`${i}-${j}`}
            style={[styles.day, { backgroundColor: j < count ? accentColor : colors.bgHover }]}
          />
        ));
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DAY_GAP,
  },
  day: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    borderRadius: DAY_SIZE / 2,
  },
});
