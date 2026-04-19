import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

function fmt(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function WeeklyRecapScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/recap/weekly')
      .then(r => setRecap(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!recap) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={{ color: colors.textMuted }}>Could not load recap.</Text>
      </View>
    );
  }

  const stats = [
    { icon: 'checkmark-circle-outline', label: 'Logged', value: recap.total_logs },
    { icon: 'flame-outline',            label: 'Streaks',  value: recap.streaks_maintained },
    { icon: 'rocket-outline',           label: 'Cheers',   value: recap.total_cheers },
    { icon: 'heart-outline',            label: 'Likes',    value: recap.total_likes },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekly Recap</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Week range */}
        <Text style={styles.weekRange}>{fmt(recap.week_start)} — {fmt(recap.week_end)}</Text>

        {/* Completion ring / headline */}
        <View style={styles.completionCard}>
          <Text style={styles.completionRate}>{recap.completion_rate}<Text style={styles.completionPct}>%</Text></Text>
          <Text style={styles.completionLabel}>completion rate</Text>
          <Text style={styles.completionSub}>{recap.habits_completed} of {recap.habit_count} habits completed this week</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {stats.map(s => (
            <View key={s.label} style={styles.statCard}>
              <Ionicons name={s.icon} size={18} color={colors.accent} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Habit breakdown */}
        {recap.habits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Habits this week</Text>
            {recap.habits.map(h => (
              <View key={h.habit_id} style={styles.habitRow}>
                <View style={[styles.habitDot, { backgroundColor: h.habit_color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.habitName}>{h.habit_name}</Text>
                  <Text style={styles.habitMeta}>
                    {h.frequency} · {h.streak > 0 ? `${h.streak} day streak` : 'no streak'}
                  </Text>
                </View>
                <View style={styles.habitLogCount}>
                  <Text style={[styles.habitLogNum, h.completed && { color: colors.accent }]}>
                    {h.logs_this_week}
                  </Text>
                  <Text style={styles.habitLogDenom}>/{h.expected_this_week}</Text>
                </View>
                {h.completed && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={{ marginLeft: 6 }} />
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    headerTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    content: { padding: spacing.lg, gap: 16 },
    weekRange: { fontSize: 13, color: colors.textMuted, fontWeight: '500', textAlign: 'center' },
    completionCard: {
      backgroundColor: colors.bgCard, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.borderSubtle,
      padding: 28, alignItems: 'center',
    },
    completionRate: { fontSize: 56, fontWeight: '700', color: colors.accent, lineHeight: 60, letterSpacing: -2 },
    completionPct: { fontSize: 28, fontWeight: '600', letterSpacing: 0 },
    completionLabel: { fontSize: 13, color: colors.textMuted, marginTop: 4, fontWeight: '500' },
    completionSub: { fontSize: 12, color: colors.textDim, marginTop: 6, textAlign: 'center' },
    statsRow: { flexDirection: 'row', gap: 8 },
    statCard: {
      flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.borderSubtle,
      padding: 14, alignItems: 'center', gap: 4,
    },
    statValue: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
    statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
    section: {
      backgroundColor: colors.bgCard, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.borderSubtle, overflow: 'hidden',
    },
    sectionTitle: {
      fontSize: 12, fontWeight: '600', color: colors.textMuted,
      paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 10,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    habitRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: spacing.md, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    habitDot: { width: 8, height: 8, borderRadius: 4 },
    habitName: { fontSize: 14, fontWeight: '500', color: colors.text },
    habitMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    habitLogCount: { flexDirection: 'row', alignItems: 'baseline' },
    habitLogNum: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
    habitLogDenom: { fontSize: 12, color: colors.textDim },
  });
}
