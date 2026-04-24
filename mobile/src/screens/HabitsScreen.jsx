import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, Alert, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import HabitCalendar from '../components/HabitCalendar';
import StreakBadge from '../components/StreakBadge';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import {
  requestNotificationPermission,
  scheduleHabitReminder,
  cancelHabitReminder,
  syncAllHabitReminders,
} from '../utils/notifications';

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

const CAL_OPTIONS = [7, 30, 90, 180, 365];
const CAL_LABELS  = { 7: '7d', 30: '30d', 90: '90d', 180: '180d', 365: '1yr' };
const CAL_DEFAULT_KEY = 'dialed_calendar_default';

const COLORS = ['#34d399','#60a5fa','#f59e0b','#f87171','#a78bfa','#ec4899','#2dd4bf','#94a3b8'];

function HabitCard({ habit, onLog, onEdit, onDelete, defaultDays = 30 }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const [logging, setLogging] = useState(false);
  const target = habit.target_count || 1;
  const [periodCount, setPeriodCount] = useState(habit.period_count ?? (habit.logged_this_period ? target : 0));
  const [calDays, setCalDays] = useState(defaultDays);
  const [milestone, setMilestone] = useState(null);
  const [showPostPrompt, setShowPostPrompt] = useState(false);
  const [loggedDay, setLoggedDay] = useState(null);

  const goalMet = periodCount >= target;

  // Sync if the parent's default changes (e.g. user changes setting and refreshes)
  useEffect(() => { setCalDays(defaultDays); }, [defaultDays]);

  const handleLog = async () => {
    setLogging(true);
    setPeriodCount(c => c + 1); // optimistic
    try {
      const { data } = await api.post(`/habits/${habit.id}/log`, { note: '' });
      onLog(habit.id, data);
      setPeriodCount(data.period_count ?? periodCount + 1);
      if (data.milestone) {
        setMilestone(data.milestone);
      } else {
        setLoggedDay(data.day != null ? Math.max(1, data.day) : null);
        setShowPostPrompt(true);
      }
    } catch (err) {
      setPeriodCount(c => Math.max(0, c - 1)); // revert
      Alert.alert('Already logged', err.response?.data?.error || 'Try again later.');
    } finally {
      setLogging(false);
    }
  };

  return (
    <View style={[styles.habitCard, { borderLeftColor: habit.color }]}>
      <View style={styles.habitHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.habitTitleRow}>
            <Text style={styles.habitName}>{habit.name}</Text>
            <StreakBadge streak={habit.streak} atRisk={habit.at_risk} />
          </View>
          {!!habit.description && (
            <Text style={styles.habitDesc}>{habit.description}</Text>
          )}
          <View style={styles.habitMeta}>
            <Text style={styles.habitMetaText}>{habit.frequency}</Text>
            <Text style={styles.habitMetaText}>{habit.total_logs} logs</Text>
            <Text style={styles.habitMetaText}>
              {habit.visibility_missed === 'friends' ? 'Friends Only' : habit.visibility_missed === 'private' ? 'Private' : 'Public'}
            </Text>
            {!!habit.reminder_time && (
              <Text style={styles.habitMetaText}>· {formatTime(habit.reminder_time)}</Text>
            )}
          </View>
        </View>
        <View style={styles.habitActions}>
          <TouchableOpacity onPress={() => onEdit(habit)} hitSlop={8} style={styles.habitActionBtn}>
            <Text style={styles.habitActionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(habit.id)} hitSlop={8} style={styles.habitActionBtn}>
            <Text style={[styles.habitActionText, { color: colors.red }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Calendar range selector */}
      <View style={styles.calRangeRow}>
        {CAL_OPTIONS.map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.calRangeBtn, calDays === d && styles.calRangeBtnActive]}
            onPress={() => setCalDays(d)}
            activeOpacity={0.7}
          >
            <Text style={[styles.calRangeText, calDays === d && { color: habit.color }]}>
              {CAL_LABELS[d]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <HabitCalendar calendar={habit.calendar || []} color={habit.color} days={calDays} frequency={habit.frequency} />

      {(() => {
        const freqLabel = habit.frequency === 'daily' ? 'Today' : habit.frequency === 'weekly' ? 'This Week' : 'This Month';
        const progressLabel = target > 1 ? ` · ${periodCount}/${target}` : '';
        const btnLabel = logging ? 'Logging…'
          : goalMet ? `✓ ${freqLabel}${progressLabel}`
          : `Log ${freqLabel}${progressLabel}`;
        return (
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: goalMet ? colors.bgHover : habit.color }, (logging || goalMet) && styles.logBtnDisabled]}
            onPress={handleLog}
            disabled={logging || goalMet}
            activeOpacity={0.85}
          >
            <Text style={[styles.logBtnText, goalMet && { color: colors.textMuted }]}>
              {btnLabel}
            </Text>
          </TouchableOpacity>
        );
      })()}

      {/* Post-to-feed prompt */}
      <Modal visible={showPostPrompt} transparent animationType="fade" onRequestClose={() => setShowPostPrompt(false)}>
        <View style={styles.milestoneOverlay}>
          <View style={styles.milestoneCard}>
            <Text style={[styles.milestoneDay, { color: habit.color }]}>
              {loggedDay ? `Day ${loggedDay}` : 'Logged'}
            </Text>
            <Text style={styles.milestoneTitle}>Share to your feed?</Text>
            <Text style={styles.milestoneHabit}>{habit.name}</Text>
            <TouchableOpacity
              style={[styles.milestoneShareBtn, { backgroundColor: habit.color }]}
              onPress={() => {
                setShowPostPrompt(false);
                navigation.navigate('CreatePost', {
                  draft: loggedDay ? `Day ${loggedDay} of ${habit.name}.` : `Logged ${habit.name} today.`,
                  habit_id: habit.id,
                  habit_day: loggedDay,
                });
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.milestoneBtnText, { color: colors.bg }]}>Share to Feed</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPostPrompt(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Milestone celebration modal */}
      <Modal visible={!!milestone} transparent animationType="fade" onRequestClose={() => setMilestone(null)}>
        <View style={styles.milestoneOverlay}>
          <View style={styles.milestoneCard}>
            <View style={styles.milestoneBadge}>
              <Ionicons name="trophy-outline" size={28} color={habit.color} />
            </View>
            <Text style={[styles.milestoneDay, { color: habit.color }]}>Day {milestone?.day}</Text>
            <Text style={styles.milestoneTitle}>{milestone?.label}</Text>
            <Text style={styles.milestoneHabit}>{habit.name}</Text>
            <TouchableOpacity
              style={[styles.milestoneShareBtn, { backgroundColor: habit.color }]}
              onPress={() => {
                setMilestone(null);
                navigation.navigate('CreatePost', {
                  draft: `Day ${milestone?.day} of ${habit.name} - ${milestone?.label}!`,
                  habit_id: habit.id,
                  habit_day: milestone?.day,
                });
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.milestoneBtnText, { color: colors.bg }]}>Share to Feed</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMilestone(null)} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TimePicker({ value, onChange }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  // value: "HH:MM" string or null
  const [hour, setHour] = useState(value ? Number(value.split(':')[0]) : 8);
  const [minute, setMinute] = useState(value ? Number(value.split(':')[1]) : 0);
  const [enabled, setEnabled] = useState(!!value);

  const update = (h, m, on) => {
    if (!on) { onChange(null); return; }
    const str = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onChange(str);
  };

  const adj = (field, delta) => {
    if (field === 'hour') {
      const h = (hour + delta + 24) % 24;
      setHour(h);
      update(h, minute, enabled);
    } else {
      const m = (minute + delta + 60) % 60;
      setMinute(m);
      update(hour, m, enabled);
    }
  };

  const toggle = (val) => {
    setEnabled(val);
    update(hour, minute, val);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: enabled ? 14 : 0 }}>
        <Text style={styles.fieldLabel}>REMINDER (optional)</Text>
        <TouchableOpacity
          onPress={() => toggle(!enabled)}
          style={[styles.togglePill, enabled && styles.togglePillOn]}
          activeOpacity={0.8}
        >
          <Text style={[styles.togglePillText, enabled && { color: colors.accent }]}>
            {enabled ? 'On' : 'Off'}
          </Text>
        </TouchableOpacity>
      </View>
      {enabled && (
        <View style={styles.timePickerRow}>
          {/* Hour */}
          <View style={styles.timeUnit}>
            <TouchableOpacity onPress={() => adj('hour', 1)} hitSlop={10}><Text style={styles.timeAdj}>▲</Text></TouchableOpacity>
            <Text style={styles.timeValue}>{String(hour % 12 || 12).padStart(2, '0')}</Text>
            <TouchableOpacity onPress={() => adj('hour', -1)} hitSlop={10}><Text style={styles.timeAdj}>▼</Text></TouchableOpacity>
          </View>
          <Text style={styles.timeColon}>:</Text>
          {/* Minute */}
          <View style={styles.timeUnit}>
            <TouchableOpacity onPress={() => adj('minute', 15)} hitSlop={10}><Text style={styles.timeAdj}>▲</Text></TouchableOpacity>
            <Text style={styles.timeValue}>{String(minute).padStart(2, '0')}</Text>
            <TouchableOpacity onPress={() => adj('minute', -15)} hitSlop={10}><Text style={styles.timeAdj}>▼</Text></TouchableOpacity>
          </View>
          {/* AM/PM */}
          <TouchableOpacity
            style={styles.ampmBtn}
            onPress={() => { const h = hour < 12 ? hour + 12 : hour - 12; setHour(h); update(h, minute, true); }}
            activeOpacity={0.7}
          >
            <Text style={styles.ampmText}>{hour < 12 ? 'AM' : 'PM'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function HabitFormModal({ habit, visible, onClose, onSave }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [form, setForm] = useState({
    name: habit?.name || '',
    description: habit?.description || '',
    frequency: habit?.frequency || 'daily',
    target_count: habit?.target_count || 1,
    visibility_missed: habit?.visibility_missed || 'public',
    color: habit?.color || '#34d399',
    reminder_time: habit?.reminder_time || null,
  });
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setForm({
        name: habit?.name || '',
        description: habit?.description || '',
        frequency: habit?.frequency || 'daily',
        target_count: habit?.target_count || 1,
        visibility_missed: habit?.visibility_missed || 'public',
        color: habit?.color || '#34d399',
        reminder_time: habit?.reminder_time || null,
      });
    }
  }, [visible, habit]);

  const set = field => value => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      if (habit) {
        const { data } = await api.put(`/habits/${habit.id}`, form);
        onSave(data, false);
      } else {
        const { data } = await api.post('/habits', form);
        onSave(data, true);
      }
      onClose();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{habit ? 'Edit Habit' : 'New Habit'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: 16 }}>
          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>HABIT NAME</Text>
            <TextInput
              style={styles.textInput}
              value={form.name}
              onChangeText={set('name')}
              placeholder="Morning Run"
              placeholderTextColor={colors.textDim}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>DESCRIPTION (optional)</Text>
            <TextInput
              style={[styles.textInput, { minHeight: 60 }]}
              value={form.description}
              onChangeText={set('description')}
              placeholder="What does this involve?"
              placeholderTextColor={colors.textDim}
              multiline
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>FREQUENCY</Text>
            <View style={styles.segmentRow}>
              {['daily', 'weekly', 'monthly'].map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.segment, form.frequency === f && styles.segmentActive]}
                  onPress={() => setForm(prev => ({
                    ...prev,
                    frequency: f,
                    target_count: f === 'daily' ? 1 : prev.target_count || 1,
                  }))}
                >
                  <Text style={[styles.segmentText, form.frequency === f && styles.segmentTextActive]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {form.frequency !== 'daily' && (
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>
                {form.frequency === 'weekly' ? 'DAYS PER WEEK' : 'TIMES PER MONTH'}
              </Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, (form.target_count || 1) <= 1 && { opacity: 0.3 }]}
                  onPress={() => setForm(f => ({ ...f, target_count: Math.max(1, (f.target_count || 1) - 1) }))}
                  disabled={(form.target_count || 1) <= 1}
                  hitSlop={10}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{form.target_count || 1}</Text>
                <TouchableOpacity
                  style={[styles.stepperBtn, (form.target_count || 1) >= (form.frequency === 'weekly' ? 7 : 28) && { opacity: 0.3 }]}
                  onPress={() => setForm(f => ({ ...f, target_count: Math.min(f.frequency === 'weekly' ? 7 : 28, (f.target_count || 1) + 1) }))}
                  disabled={(form.target_count || 1) >= (form.frequency === 'weekly' ? 7 : 28)}
                  hitSlop={10}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>MISSED DAYS VISIBILITY</Text>
            <View style={styles.segmentRow}>
              {['public', 'friends', 'private'].map(v => (
                <TouchableOpacity
                  key={v}
                  style={[styles.segment, form.visibility_missed === v && styles.segmentActive]}
                  onPress={() => set('visibility_missed')(v)}
                >
                  <Text style={[styles.segmentText, form.visibility_missed === v && styles.segmentTextActive]}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formField}>
            <TimePicker
              value={form.reminder_time}
              onChange={t => setForm(f => ({ ...f, reminder_time: t }))}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>COLOR</Text>
            <View style={styles.colorRow}>
              {COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, form.color === c && styles.colorDotSelected]}
                  onPress={() => set('color')(c)}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function HabitsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editHabit, setEditHabit] = useState(null);
  const [calDefault, setCalDefault] = useState(7);

  useEffect(() => {
    AsyncStorage.getItem(CAL_DEFAULT_KEY).then(v => {
      if (v) setCalDefault(Number(v));
    });
  }, []);

  // Refresh default when screen is focused (user may have changed it in Settings)
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(CAL_DEFAULT_KEY).then(v => { if (v) setCalDefault(Number(v)); });
  }, []));

  // Request notification permission once on mount
  useEffect(() => { requestNotificationPermission(); }, []);

  const load = useCallback(async () => {
    const { data } = await api.get('/habits');
    setHabits(data);
    syncAllHabitReminders(data);
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleLog = (habitId, data) => {
    setHabits(prev => prev.map(h =>
      h.id === habitId ? { ...h, streak: data.streak, at_risk: data.at_risk, total_logs: data.total_logs } : h
    ));
  };

  const handleDelete = id => {
    Alert.alert('Delete habit?', 'All logs will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await api.delete(`/habits/${id}`);
          cancelHabitReminder(id);
          setHabits(prev => prev.filter(h => h.id !== id));
        },
      },
    ]);
  };

  const handleSave = (habit, isNew) => {
    scheduleHabitReminder(habit);
    if (isNew) setHabits(prev => [{ ...habit, calendar: [], streak: 0, at_risk: false, total_logs: 0 }, ...prev]);
    else setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, ...habit } : h));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Habits</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { setEditHabit(null); setShowForm(true); }}
          activeOpacity={0.85}
        >
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <FlatList
          data={habits}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <HabitCard
              habit={item}
              onLog={handleLog}
              onEdit={h => { setEditHabit(h); setShowForm(true); }}
              onDelete={handleDelete}
              defaultDays={calDefault}
            />
          )}
          contentContainerStyle={{ padding: spacing.lg, gap: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="radio-button-on-outline" size={24} color={colors.textDim} />
              </View>
              <Text style={styles.emptyTitle}>No habits yet</Text>
              <Text style={styles.emptyText}>Create your first habit and start building streaks.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowForm(true)}>
                <Text style={styles.emptyBtnText}>Create your first habit</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <HabitFormModal
        habit={editHabit}
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
      />
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
    headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    addBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: 14, paddingVertical: 7,
    },
    addBtnText: { color: colors.bg, fontWeight: '600', fontSize: 13 },
    loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    habitCard: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.md,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderLeftWidth: 3,
      gap: 12,
    },
    habitHeader: { flexDirection: 'row', gap: 8 },
    habitTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
    habitName: { fontSize: 15, fontWeight: '600', color: colors.text },
    habitDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 4 },
    habitMeta: { flexDirection: 'row', gap: 10 },
    habitMetaText: { fontSize: 11, color: colors.textDim, textTransform: 'capitalize' },
    habitActions: { gap: 6 },
    habitActionBtn: {
      paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: radius.xs, borderWidth: 1, borderColor: colors.borderSubtle,
    },
    habitActionText: { fontSize: 11, fontWeight: '500', color: colors.textMuted },

    calRangeRow: { flexDirection: 'row', gap: 4 },
    calRangeBtn: {
      paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: radius.xs, borderWidth: 1, borderColor: colors.borderSubtle,
    },
    calRangeBtnActive: { borderColor: 'transparent', backgroundColor: colors.bgHover },
    calRangeText: { fontSize: 11, fontWeight: '500', color: colors.textDim },

    logBtn: { borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
    logBtnDisabled: { opacity: 0.6 },
    logBtnText: { color: colors.bg, fontWeight: '600', fontSize: 14 },

    // Modal
    modalContainer: { flex: 1, backgroundColor: colors.bg },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    },
    modalTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    formField: { gap: 6 },
    fieldLabel: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    textInput: {
      backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.sm, color: colors.text, fontSize: 15,
      paddingHorizontal: 14, paddingVertical: 11, textAlignVertical: 'top',
    },
    segmentRow: { flexDirection: 'row', gap: 6 },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    stepperBtn: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgInput },
    stepperBtnText: { fontSize: 20, color: colors.text, fontWeight: '400', lineHeight: 24 },
    stepperValue: { fontSize: 22, fontWeight: '700', color: colors.text, minWidth: 30, textAlign: 'center' },
    segment: {
      flex: 1, paddingVertical: 9, borderRadius: radius.sm,
      backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.borderSubtle,
      alignItems: 'center',
    },
    segmentActive: { backgroundColor: colors.accentDim, borderColor: colors.accent },
    segmentText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    segmentTextActive: { color: colors.accent, fontWeight: '600' },

    // Time picker
    togglePill: {
      paddingHorizontal: 12, paddingVertical: 4,
      borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    },
    togglePillOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
    togglePillText: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
    timePickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.bgHover, borderRadius: radius.md, padding: 14,
    },
    timeUnit: { alignItems: 'center', gap: 6 },
    timeAdj: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
    timeValue: { fontSize: 28, fontWeight: '600', color: colors.text, minWidth: 42, textAlign: 'center' },
    timeColon: { fontSize: 28, fontWeight: '600', color: colors.text, marginTop: -4 },
    ampmBtn: {
      marginLeft: 4, paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: colors.accentDim, borderRadius: radius.sm,
      borderWidth: 1, borderColor: colors.accentDimBorder,
    },
    ampmText: { fontSize: 14, fontWeight: '600', color: colors.accent },

    colorRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    colorDot: { width: 28, height: 28, borderRadius: 14 },
    colorDotSelected: { borderWidth: 2.5, borderColor: colors.text },

    // Empty state
    empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30 },
    emptyIcon: {
      width: 52, height: 52, borderRadius: radius.md,
      backgroundColor: colors.bgHover,
      justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 6 },
    emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
    emptyBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: 18, paddingVertical: 10,
    },
    emptyBtnText: { color: colors.bg, fontWeight: '600', fontSize: 14 },

    // Milestone modal
    milestoneOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center', alignItems: 'center', padding: 32,
    },
    milestoneCard: {
      backgroundColor: colors.bgCard, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.borderSubtle,
      padding: 28, alignItems: 'center', width: '100%',
    },
    milestoneBadge: {
      width: 56, height: 56, borderRadius: radius.md,
      backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.borderSubtle,
      justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    milestoneDay: { fontSize: 36, fontWeight: '700', lineHeight: 40, letterSpacing: -1 },
    milestoneTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 4 },
    milestoneHabit: { fontSize: 13, color: colors.textMuted, marginTop: 6, marginBottom: 20 },
    milestoneShareBtn: {
      borderRadius: radius.sm, paddingHorizontal: 24, paddingVertical: 11,
      width: '100%', alignItems: 'center',
    },
    milestoneBtnText: { fontSize: 15, fontWeight: '600' },
  });
}
