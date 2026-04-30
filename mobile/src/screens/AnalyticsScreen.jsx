import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { usePro } from '../context/ProContext';
import { radius, spacing } from '../theme';

const WINDOWS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function completionRate(calendar, days) {
  const slice = calendar.slice(-days);
  if (!slice.length) return 0;
  const completed = slice.filter(e => e.count >= e.target).length;
  return Math.round((completed / slice.length) * 100);
}

function longestStreak(calendar) {
  let best = 0, cur = 0;
  for (const e of calendar) {
    if (e.count >= e.target) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}

function RateBar({ rate, color }) {
  const { colors } = useTheme();
  return (
    <View style={[barStyles.track, { backgroundColor: colors.bgHover }]}>
      <View style={[barStyles.fill, { width: `${rate}%`, backgroundColor: color }]} />
    </View>
  );
}
const barStyles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden', flex: 1 },
  fill:  { height: '100%', borderRadius: 3 },
});

function StatBox({ label, value, sub, color }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isPro } = usePro();

  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [window, setWindow] = useState(30);

  useFocusEffect(useCallback(() => {
    let active = true;
    api.get('/habits').then(({ data }) => {
      if (active) { setHabits(data); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  if (!isPro) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analytics</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.gateWrap}>
          <View style={styles.gateIcon}>
            <Ionicons name="bar-chart-outline" size={28} color={colors.textDim} />
          </View>
          <Text style={styles.gateTitle}>Pro feature</Text>
          <Text style={styles.gateDesc}>
            Full habit analytics — completion rates, trend breakdowns, and streak history — are available on Dialed Pro.
          </Text>
          <TouchableOpacity
            style={styles.gateBtn}
            onPress={() => navigation.navigate('Paywall', { source: 'analytics' })}
            activeOpacity={0.85}
          >
            <Text style={styles.gateBtnText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Overall stats across all habits ──────────────────────────────────────
  const totalLogs   = habits.reduce((s, h) => s + (h.total_logs || 0), 0);
  const bestStreak  = habits.reduce((s, h) => Math.max(s, h.streak || 0), 0);
  const activeCount = habits.filter(h => h.is_active !== 0).length;

  const overallRate = (() => {
    if (!habits.length) return 0;
    const rates = habits.map(h => completionRate(h.calendar || [], window));
    return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
  })();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: 20, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Overall summary ─────────────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Overview</Text>
            <View style={styles.statRow}>
              <StatBox label="Active habits"  value={activeCount}        />
              <StatBox label="Total logs"     value={totalLogs}          />
              <StatBox label="Best streak"    value={`${bestStreak}d`}   color={colors.accent} />
            </View>
          </View>

          {/* ── Window selector ─────────────────────────────────────────── */}
          <View style={styles.windowRow}>
            {WINDOWS.map(w => (
              <TouchableOpacity
                key={w.days}
                style={[styles.windowBtn, window === w.days && styles.windowBtnActive]}
                onPress={() => setWindow(w.days)}
                activeOpacity={0.75}
              >
                <Text style={[styles.windowBtnText, window === w.days && { color: colors.accent }]}>
                  {w.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Overall completion rate ──────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.overallRow}>
              <View>
                <Text style={styles.cardTitle}>Overall completion</Text>
                <Text style={styles.cardSub}>Average across all habits</Text>
              </View>
              <Text style={[styles.bigRate, { color: overallRate >= 70 ? colors.accent : overallRate >= 40 ? '#f59e0b' : '#f87171' }]}>
                {overallRate}%
              </Text>
            </View>
            <RateBar rate={overallRate} color={overallRate >= 70 ? colors.accent : overallRate >= 40 ? '#f59e0b' : '#f87171'} />
          </View>

          {/* ── Per-habit breakdown ──────────────────────────────────────── */}
          {habits.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>By habit</Text>
              <View style={{ gap: 16, marginTop: 4 }}>
                {habits.map(h => {
                  const rate    = completionRate(h.calendar || [], window);
                  const best    = longestStreak(h.calendar || []);
                  const rateColor = rate >= 70 ? colors.accent : rate >= 40 ? '#f59e0b' : '#f87171';
                  return (
                    <View key={h.id} style={styles.habitRow}>
                      <View style={[styles.habitDot, { backgroundColor: h.color }]} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <View style={styles.habitRowTop}>
                          <Text style={styles.habitName} numberOfLines={1}>{h.name}</Text>
                          <Text style={[styles.habitRate, { color: rateColor }]}>{rate}%</Text>
                        </View>
                        <View style={styles.habitBarRow}>
                          <RateBar rate={rate} color={rateColor} />
                        </View>
                        <View style={styles.habitMeta}>
                          <Text style={styles.metaText}>{h.frequency}</Text>
                          <Text style={styles.metaDot}>·</Text>
                          <Text style={styles.metaText}>Streak {h.streak}</Text>
                          <Text style={styles.metaDot}>·</Text>
                          <Text style={styles.metaText}>Best {best}</Text>
                          <Text style={styles.metaDot}>·</Text>
                          <Text style={styles.metaText}>{h.total_logs} logs</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {habits.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No habits yet. Create one to start tracking analytics.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    card: {
      backgroundColor: colors.bgCard, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.borderSubtle,
      padding: spacing.lg, gap: 12,
    },
    cardTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

    statRow: { flexDirection: 'row', gap: 8 },
    statBox: {
      flex: 1, backgroundColor: colors.bgHover,
      borderRadius: radius.sm, padding: 12, alignItems: 'center', gap: 3,
    },
    statValue: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
    statLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
    statSub:   { fontSize: 10, color: colors.textDim },

    windowRow: { flexDirection: 'row', gap: 8 },
    windowBtn: {
      flex: 1, paddingVertical: 8, borderRadius: radius.sm,
      borderWidth: 1, borderColor: colors.borderSubtle,
      alignItems: 'center', backgroundColor: colors.bgCard,
    },
    windowBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
    windowBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },

    overallRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    bigRate: { fontSize: 36, fontWeight: '700', letterSpacing: -1 },

    habitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    habitDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
    habitRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    habitName: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1, marginRight: 8 },
    habitRate: { fontSize: 14, fontWeight: '700' },
    habitBarRow: { flexDirection: 'row' },
    habitMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    metaText: { fontSize: 11, color: colors.textDim },
    metaDot:  { fontSize: 11, color: colors.textDim },

    // Gate / paywall
    gateWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    gateIcon: {
      width: 64, height: 64, borderRadius: radius.md,
      backgroundColor: colors.bgHover, justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    gateTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
    gateDesc: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
    gateBtn: {
      backgroundColor: colors.accent, borderRadius: radius.sm,
      paddingHorizontal: 24, paddingVertical: 12,
    },
    gateBtnText: { color: colors.bg, fontWeight: '700', fontSize: 15 },

    emptyWrap: { padding: 24, alignItems: 'center' },
    emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  });
}
