import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const DAY_SIZE = 10;
const DAY_GAP  = 3;

export default function HabitCalendar({ calendar = [], color, compact = false, days }) {
  const { colors } = useTheme();
  const accentColor = color ?? colors.accent;
  const sliceDays = days ?? (compact ? 91 : calendar.length);

  const sliced = useMemo(
    () => calendar.slice(-sliceDays),
    [calendar, sliceDays]
  );

  return (
    <View style={styles.grid}>
      {sliced.map((day, i) => (
        <View
          key={i}
          style={[
            styles.day,
            day.logged
              ? { backgroundColor: accentColor }
              : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
          ]}
        />
      ))}
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
    borderRadius: 2,
  },
});
