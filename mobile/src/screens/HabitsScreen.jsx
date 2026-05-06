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
import api, { invalidateCache } from '../api/client';
import HabitCalendar from '../components/HabitCalendar';
import StreakBadge from '../components/StreakBadge';
import { radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { usePro } from '../context/ProContext';
import {
  scheduleHabitReminder,
  cancelHabitReminder,
  syncAllHabitReminders,
} from '../utils/notifications';

const FREE_HABIT_LIMIT = 3;

// Returns { canRestore, lastStreak } by inspecting the calendar for a recently broken streak.
// "Recent" = ≤3 missed periods from the last completed one.
function getRestoreInfo(calendar = []) {
  if (!calendar.length) return { canRestore: false, lastStreak: 0 };

  // Find how many trailing missed periods there are
  let missedTail = 0;
  for (let i = calendar.length - 1; i >= 0; i--) {
    if (calendar[i].count >= calendar[i].target) break;
    missedTail++;
  }
  if (missedTail === 0 || missedTail > 3) return { canRestore: false, lastStreak: 0 };

  // Count the consecutive run just before the break
  let lastStreak = 0;
  const lastCompletedIdx = calendar.length - 1 - missedTail;
  for (let i = lastCompletedIdx; i >= 0; i--) {
    if (calendar[i].count >= calendar[i].target) lastStreak++;
    else break;
  }

  return { canRestore: lastStreak > 0, lastStreak };
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

const HABIT_NUDGE_KEY = 'dialed_habit_nudge_v1';

const CAL_OPTIONS = [7, 30, 90, 180, 365];
const CAL_LABELS  = { 7: '7d', 30: '30d', 90: '90d', 180: '180d', 365: '1yr' };
const CAL_DEFAULT_KEY = 'dialed_calendar_default';

const COLORS = ['#34d399','#60a5fa','#f59e0b','#f87171','#a78bfa','#ec4899','#2dd4bf','#94a3b8'];

function HabitCard({ habit, onLog, onEdit, onDelete, defaultDays = 30 }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const { isPro, streakFreezes, useFreeze } = usePro();
  const [logging, setLogging] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const target = habit.target_count || 1;
  const [periodCount, setPeriodCount] = useState(habit.period_count ?? (habit.logged_this_period ? target : 0));
  const [loggedToday, setLoggedToday] = useState(!!habit.logged_today);
  const [calDays, setCalDays] = useState(defaultDays);
  const [milestone, setMilestone] = useState(null);
  const [loggedDay, setLoggedDay] = useState(null);

  const goalMet = periodCount >= target;
  // Even if the weekly/monthly goal isn't met, you can only log once per day.
  const lockedUntilTomorrow = loggedToday && !goalMet;

  // Sync if the parent's default changes (e.g. user changes setting and refreshes)
  useEffect(() => { setCalDays(defaultDays); }, [defaultDays]);

  // Sync local periodCount when the parent re-fetches /habits (e.g. after an
  // undo). FlatList re-uses the same component instance per habit id, so
  // useState's initializer doesn't re-run on prop change — without this the
  // bumped optimistic count would persist after the server says it's gone.
  useEffect(() => {
    setPeriodCount(habit.period_count ?? (habit.logged_this_period ? target : 0));
    setLoggedToday(!!habit.logged_today);
  }, [habit.period_count, habit.logged_this_period, habit.logged_today, target]);

  const handleFreeze = async () => {
    if (freezing) return;
    setFreezing(true); // set before Alert to block double-tap
    Alert.alert(
      'Use a streak freeze?',
      `This will protect your ${habit.streak}-day streak on "${habit.name}". You have ${streakFreezes} freeze${streakFreezes === 1 ? '' : 's'} remaining.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setFreezing(false) }, // reset on dismiss
        {
          text: 'Use freeze',
          onPress: async () => {
            try {
              await useFreeze(habit.id);
              Alert.alert('Streak protected', `Your streak is safe. ${streakFreezes - 1} freeze${streakFreezes - 1 === 1 ? '' : 's'} remaining.`);
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Could not use freeze.');
            } finally {
              setFreezing(false);
            }
          },
        },
      ]
    );
  };

  const { canRestore, lastStreak } = getRestoreInfo(habit.calendar);

  const handleRestore = async () => {
    if (freezing) return;
    setFreezing(true);
    Alert.alert(
      'Restore streak?',
      `This will bring back your ${lastStreak}-day streak on "${habit.name}" by filling in the missed ${habit.frequency === 'daily' ? 'days' : habit.frequency === 'weekly' ? 'weeks' : 'months'}. Costs 1 streak freeze (${streakFreezes} remaining).`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setFreezing(false) },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              const { data } = await api.post('/pro/restore-streak', { habit_id: habit.id });
              // Reload the habit list so calendar + streak update
              onLog(habit.id, { streak: lastStreak, at_risk: false, total_logs: habit.total_logs + data.periods_filled, period_count: habit.period_count });
              Alert.alert('Streak restored!', `Your ${lastStreak}-day streak is back. ${data.freezes_remaining} freeze${data.freezes_remaining === 1 ? '' : 's'} remaining.`);
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Could not restore streak.');
            } finally {
              setFreezing(false);
            }
          },
        },
      ]
    );
  };

  const isPublicHabit = !habit.visibility_missed || (habit.visibility_missed !== 'private' && habit.visibility_missed !== 'buddy');

  const navigateToPost = (day, ms) => {
    navigation.navigate('CreatePost', {
      draft: ms
        ? `Day ${ms.day} of ${habit.name} - ${ms.label}!`
        : day ? `Day ${day} of ${habit.name}.` : `Logged ${habit.name} today.`,
      habit_id: habit.id,
      habit_day: ms?.day ?? day,
      habit_name: habit.name,
      habit_color: habit.color,
      required: true,
    });
  };

  const handleLog = async () => {
    setLogging(true);
    setPeriodCount(c => c + 1); // optimistic
    setLoggedToday(true);        // optimistic — locks the button immediately
    try {
      const { data } = await api.post(`/habits/${habit.id}/log`, { note: '' });
      onLog(habit.id, data);
      setPeriodCount(data.period_count ?? periodCount + 1);
      if (typeof data.logged_today === 'boolean') setLoggedToday(data.logged_today);
      if (data.milestone) {
        setMilestone(data.milestone);
        // For private habits, show milestone but don't force a post
        if (!isPublicHabit) {
          setLoggedDay(data.milestone.day);
        }
      } else if (isPublicHabit) {
        // Public / friends — go straight to CreatePost, no skip
        const day = data.streak ?? null;
        navigateToPost(day, null);
      }
    } catch (err) {
      setPeriodCount(c => Math.max(0, c - 1)); // revert
      setLoggedToday(!!habit.logged_today);    // revert optimistic lock
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
              {habit.visibility_missed === 'friends' ? 'Friends only'
                : habit.visibility_missed === 'private' ? 'Private'
                : habit.visibility_missed === 'buddy' ? 'Buddy only'
                : 'Public'}
            </Text>
            {Array.isArray(habit.reminders) && habit.reminders.length > 1 ? (
              <Text style={styles.habitMetaText}>· {habit.reminders.length} reminders</Text>
            ) : !!(habit.reminders?.[0] || habit.reminder_time) && (
              <Text style={styles.habitMetaText}>· {formatTime(habit.reminders?.[0] || habit.reminder_time)}</Text>
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
        const periodNoun = habit.frequency === 'weekly' ? 'this week'
          : habit.frequency === 'monthly' ? 'this month'
          : null;
        const progressLabel = target > 1 && periodNoun
          ? ` · ${periodCount}/${target} days ${periodNoun}`
          : '';
        const disabled = logging || goalMet || lockedUntilTomorrow;
        const btnLabel = logging ? 'Logging…'
          : goalMet ? (target > 1 ? `✓ Done${progressLabel}` : '✓ Logged today')
          : lockedUntilTomorrow ? `✓ Logged today${progressLabel}`
          : target > 1 ? `Log today${progressLabel}`
          : 'Log today';
        return (
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: disabled ? colors.bgHover : habit.color }, disabled && styles.logBtnDisabled]}
            onPress={handleLog}
            disabled={disabled}
            activeOpacity={0.85}
          >
            <Text style={[styles.logBtnText, disabled && { color: colors.textMuted }]}>
              {btnLabel}
            </Text>
          </TouchableOpacity>
        );
      })()}

      {/* At-risk streak banner */}
      {habit.at_risk && habit.streak > 0 && !goalMet && (
        isPro ? (
          <TouchableOpacity
            style={[styles.riskBanner, styles.riskBannerPro]}
            onPress={handleFreeze}
            disabled={freezing || streakFreezes < 1}
            activeOpacity={0.85}
          >
            <Ionicons name="snow-outline" size={14} color="#60a5fa" />
            <Text style={styles.riskBannerTextPro}>
              {freezing ? 'Saving streak…'
                : streakFreezes > 0 ? `${habit.streak}-day streak at risk · Use a freeze (${streakFreezes} left)`
                : `${habit.streak}-day streak at risk · No freezes remaining`}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.riskBanner, styles.riskBannerFree]}
            onPress={() => navigation.navigate('Paywall', { source: 'streak_risk' })}
            activeOpacity={0.85}
          >
            <Ionicons name="warning-outline" size={14} color={colors.red} />
            <Text style={styles.riskBannerTextFree}>
              {habit.streak}-day streak at risk · Protect it with Pro
            </Text>
            <Ionicons name="chevron-forward" size={12} color={colors.red} />
          </TouchableOpacity>
        )
      )}

      {/* Broken streak restore banner */}
      {habit.streak === 0 && canRestore && (
        isPro ? (
          <TouchableOpacity
            style={[styles.riskBanner, styles.restoreBannerPro]}
            onPress={handleRestore}
            disabled={freezing || streakFreezes < 1}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={14} color={colors.accent} />
            <Text style={styles.restoreBannerTextPro}>
              {freezing ? 'Restoring…'
                : streakFreezes > 0
                  ? `Restore your ${lastStreak}-day streak · 1 freeze (${streakFreezes} left)`
                  : `${lastStreak}-day streak expired · No freezes remaining`}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.riskBanner, styles.restoreBannerFree]}
            onPress={() => navigation.navigate('Paywall', { source: 'streak_restore' })}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={14} color="#a78bfa" />
            <Text style={styles.restoreBannerTextFree}>
              Restore your {lastStreak}-day streak with Pro
            </Text>
            <Ionicons name="chevron-forward" size={12} color="#a78bfa" />
          </TouchableOpacity>
        )
      )}

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
                const ms = milestone;
                setMilestone(null);
                if (isPublicHabit) navigateToPost(ms?.day, ms);
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.milestoneBtnText, { color: colors.bg }]}>
                {isPublicHabit ? 'Share to Feed' : 'Done'}
              </Text>
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
  // value: "HH:MM" string or null. Defensive parse — bad data must not throw.
  const parseTime = (v) => {
    if (typeof v !== 'string' || !v.includes(':')) return { h: 8, m: 0 };
    const [hStr, mStr] = v.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    return {
      h: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 8,
      m: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
    };
  };
  const initial = parseTime(value);
  const [hour, setHour] = useState(initial.h);
  const [minute, setMinute] = useState(initial.m);
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
        <Text style={styles.fieldLabel}>Reminder (optional)</Text>
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

// Multi-reminder Pro feature. Free users: 1 reminder. Pro users: up to 10.
// State is held by the parent form and synced to the backend on Save.
function RemindersField({ reminders, onChange, isPro, onUpgradePress }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [picking, setPicking] = useState(false);
  const [draftHour, setDraftHour] = useState(8);
  const [draftMinute, setDraftMinute] = useState(0);
  const limit = isPro ? 10 : 1;
  const atLimit = reminders.length >= limit;

  const adj = (field, delta) => {
    if (field === 'hour') setDraftHour(h => (h + delta + 24) % 24);
    else setDraftMinute(m => (m + delta + 60) % 60);
  };

  const addDraft = () => {
    const t = `${String(draftHour).padStart(2, '0')}:${String(draftMinute).padStart(2, '0')}`;
    if (reminders.includes(t)) {
      setPicking(false);
      return;
    }
    onChange([...reminders, t].sort());
    setPicking(false);
  };

  const removeAt = (i) => {
    const next = reminders.slice();
    next.splice(i, 1);
    onChange(next);
  };

  const handleAddPress = () => {
    if (atLimit && !isPro) {
      Alert.alert(
        'Dialed Pro',
        'Free plan is limited to 1 reminder per habit. Upgrade for up to 10.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'See Pro', onPress: onUpgradePress },
        ]
      );
      return;
    }
    if (atLimit) {
      Alert.alert('Limit reached', `Up to ${limit} reminders per habit.`);
      return;
    }
    // Default to 9:00 am for the first one, otherwise 1 hour after the last.
    if (reminders.length === 0) {
      setDraftHour(9); setDraftMinute(0);
    } else {
      const last = reminders[reminders.length - 1];
      const [h, m] = last.split(':').map(n => parseInt(n, 10));
      setDraftHour((h + 1) % 24); setDraftMinute(Number.isFinite(m) ? m : 0);
    }
    setPicking(true);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={styles.fieldLabel}>Reminders</Text>
        {!isPro && (
          <Text style={{ fontSize: 11, color: colors.textDim }}>Free: 1 · Pro: 10</Text>
        )}
      </View>

      {reminders.length === 0 && !picking && (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>
          No reminders set.
        </Text>
      )}

      {reminders.map((t, i) => (
        <View
          key={`${t}-${i}`}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: colors.bgHover, borderRadius: radius.sm,
            paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{formatTime(t)}</Text>
          <TouchableOpacity onPress={() => removeAt(i)} hitSlop={10}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ))}

      {picking && (
        <View style={[styles.timePickerRow, { marginTop: 4, marginBottom: 10 }]}>
          <View style={styles.timeUnit}>
            <TouchableOpacity onPress={() => adj('hour', 1)} hitSlop={10}><Text style={styles.timeAdj}>▲</Text></TouchableOpacity>
            <Text style={styles.timeValue}>{String(draftHour % 12 || 12).padStart(2, '0')}</Text>
            <TouchableOpacity onPress={() => adj('hour', -1)} hitSlop={10}><Text style={styles.timeAdj}>▼</Text></TouchableOpacity>
          </View>
          <Text style={styles.timeColon}>:</Text>
          <View style={styles.timeUnit}>
            <TouchableOpacity onPress={() => adj('minute', 15)} hitSlop={10}><Text style={styles.timeAdj}>▲</Text></TouchableOpacity>
            <Text style={styles.timeValue}>{String(draftMinute).padStart(2, '0')}</Text>
            <TouchableOpacity onPress={() => adj('minute', -15)} hitSlop={10}><Text style={styles.timeAdj}>▼</Text></TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.ampmBtn}
            onPress={() => setDraftHour(h => h < 12 ? h + 12 : h - 12)}
            activeOpacity={0.7}
          >
            <Text style={styles.ampmText}>{draftHour < 12 ? 'AM' : 'PM'}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => setPicking(false)} hitSlop={8} style={{ paddingHorizontal: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={addDraft} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.accent, borderRadius: radius.sm }}>
            <Text style={{ color: colors.bg, fontSize: 14, fontWeight: '700' }}>Add</Text>
          </TouchableOpacity>
        </View>
      )}

      {!picking && (
        <TouchableOpacity
          onPress={handleAddPress}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 6,
            paddingVertical: 10, borderRadius: radius.sm,
            borderWidth: 1, borderColor: colors.borderSubtle, borderStyle: 'dashed',
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={16} color={atLimit && !isPro ? colors.accent : colors.textMuted} />
          <Text style={{ color: atLimit && !isPro ? colors.accent : colors.textMuted, fontSize: 14, fontWeight: '600' }}>
            {atLimit && !isPro ? 'Add more with Pro' : 'Add reminder'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function HabitFormModal({ habit, visible, onClose, onSave }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const { isPro } = usePro();
  const initialReminders = () => {
    if (Array.isArray(habit?.reminders) && habit.reminders.length) return [...habit.reminders];
    if (habit?.reminder_time) return [habit.reminder_time];
    return [];
  };
  const [form, setForm] = useState({
    name: habit?.name || '',
    description: habit?.description || '',
    frequency: habit?.frequency || 'daily',
    target_count: habit?.target_count || 1,
    visibility_missed: habit?.visibility_missed || 'public',
    color: habit?.color || '#34d399',
    reminders: initialReminders(),
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
        reminders: initialReminders(),
      });
    }
  }, [visible, habit]);

  const set = field => value => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      // Backend expects `reminders` (array). For backward compat with older
      // server versions, keep reminder_time set to the first entry too.
      const payload = {
        ...form,
        reminders: form.reminders,
        reminder_time: form.reminders[0] || null,
      };
      if (habit) {
        const { data } = await api.put(`/habits/${habit.id}`, payload);
        onSave(data, false);
      } else {
        const { data } = await api.post('/habits', payload);
        onSave(data, true);
      }
      onClose();
    } catch (err) {
      if (err.response?.data?.pro_gate) {
        Alert.alert(
          'Dialed Pro',
          err.response.data.error,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'See Pro', onPress: () => { onClose(); navigation.navigate('Paywall'); } },
          ]
        );
      } else {
        Alert.alert('Error', err.response?.data?.error || 'Failed to save');
      }
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
            <Text style={styles.fieldLabel}>Habit name</Text>
            <TextInput
              style={styles.textInput}
              value={form.name}
              onChangeText={set('name')}
              placeholder="Morning Run"
              placeholderTextColor={colors.textDim}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Description (optional)</Text>
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
            <Text style={styles.fieldLabel}>How often?</Text>
            <View style={styles.segmentRow}>
              {[
                { value: 'daily', label: 'Every day' },
                { value: 'weekly', label: 'Days per week' },
                { value: 'monthly', label: 'Times per month' },
              ].map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.segment, form.frequency === value && styles.segmentActive]}
                  onPress={() => setForm(prev => ({
                    ...prev,
                    frequency: value,
                    // Default to a sensible target when switching modes
                    target_count: value === 'daily' ? 1
                      : value === 'weekly' ? (prev.target_count > 1 && prev.target_count <= 7 ? prev.target_count : 5)
                      : (prev.target_count || 1),
                  }))}
                >
                  <Text style={[styles.segmentText, form.frequency === value && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldHint}>
              {form.frequency === 'daily'
                ? 'One log every day. Want a rest day? Pick "Days per week".'
                : form.frequency === 'weekly'
                  ? `Log up to once per day, ${form.target_count || 5} day${(form.target_count || 5) === 1 ? '' : 's'} a week.`
                  : 'Log up to once per day this month.'}
            </Text>
          </View>

          {form.frequency !== 'daily' && (
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>
                {form.frequency === 'weekly' ? 'Days per week' : 'Days per month'}
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
            <Text style={styles.fieldLabel}>Missed days visibility</Text>
            <View style={styles.segmentRow}>
              {[
                { value: 'public', label: 'Public' },
                { value: 'friends', label: 'Friends' },
                { value: 'buddy', label: 'Buddy' },
                { value: 'private', label: 'Private' },
              ].map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.segment, form.visibility_missed === value && styles.segmentActive]}
                  onPress={() => set('visibility_missed')(value)}
                >
                  <Text style={[styles.segmentText, form.visibility_missed === value && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formField}>
            <RemindersField
              reminders={form.reminders}
              onChange={r => setForm(f => ({ ...f, reminders: r }))}
              isPro={isPro}
              onUpgradePress={() => { onClose(); navigation.navigate('Paywall'); }}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Color</Text>
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
  const navigation = useNavigation();
  const { isPro } = usePro();
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editHabit, setEditHabit] = useState(null);
  const [calDefault, setCalDefault] = useState(7);
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CAL_DEFAULT_KEY).then(v => {
      if (v) setCalDefault(Number(v));
    });
  }, []);

  // Refresh default when screen is focused (user may have changed it in Settings)
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(CAL_DEFAULT_KEY).then(v => { if (v) setCalDefault(Number(v)); });
  }, []));


  const load = useCallback(async () => {
    const { data } = await api.get('/habits');
    setHabits(data);
    syncAllHabitReminders(data);
    if (data.length === 0) {
      const seen = await AsyncStorage.getItem(HABIT_NUDGE_KEY);
      if (!seen) setShowNudge(true);
    }
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
    // Bust the habits cache so a tab-switch reload doesn't serve stale period_count
    invalidateCache('/habits');
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const target = h.target_count || 1;
      const newPeriodCount = data.period_count ?? (h.period_count || 0) + 1;
      return {
        ...h,
        streak: data.streak,
        at_risk: data.at_risk,
        total_logs: data.total_logs,
        period_count: newPeriodCount,
        logged_today: data.logged_today ?? true,
        logged_this_period: newPeriodCount >= target,
      };
    }));
  };

  const handleDelete = id => {
    Alert.alert('Delete habit?', 'All logs will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/habits/${id}`);
            cancelHabitReminder(id);
            setHabits(prev => prev.filter(h => h.id !== id));
          } catch (err) {
            Alert.alert('Error', 'Could not delete habit.');
          }
        },
      },
    ]);
  };

  const dismissNudge = async (openForm = false) => {
    await AsyncStorage.setItem(HABIT_NUDGE_KEY, 'true');
    setShowNudge(false);
    if (openForm) {
      setEditHabit(null);
      setShowForm(true);
    }
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Analytics')}
            hitSlop={10}
            style={styles.analyticsBtn}
          >
            <Ionicons name="bar-chart-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              if (!isPro && habits.length >= FREE_HABIT_LIMIT) {
                navigation.navigate('Paywall', { source: 'habit_limit' });
                return;
              }
              setEditHabit(null);
              setShowForm(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <FlatList
          data={habits}
          keyExtractor={item => String(item.id)}
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

      <Modal visible={showNudge} transparent animationType="none" onRequestClose={() => dismissNudge()}>
        <View style={styles.nudgeOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => dismissNudge()} activeOpacity={1} />
          <View style={styles.nudgeCard}>
            <View style={styles.nudgeIconWrap}>
              <Ionicons name="radio-button-on" size={28} color={colors.accent} />
            </View>
            <Text style={styles.nudgeTitle}>Create your first habit</Text>
            <Text style={styles.nudgeDesc}>
              Pick something you want to show up for. One tap to log it each day, week, or month. Your streak starts now.
            </Text>
            <TouchableOpacity style={styles.nudgeBtn} onPress={() => dismissNudge(true)} activeOpacity={0.85}>
              <Text style={styles.nudgeBtnText}>Create a habit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => dismissNudge()} style={styles.nudgeSkip} hitSlop={10}>
              <Text style={styles.nudgeSkipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    analyticsBtn: {
      width: 32, height: 32, borderRadius: radius.sm,
      borderWidth: 1, borderColor: colors.borderSubtle,
      justifyContent: 'center', alignItems: 'center',
    },
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

    riskBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1,
    },
    riskBannerPro: {
      backgroundColor: 'rgba(96,165,250,0.08)', borderColor: 'rgba(96,165,250,0.25)',
    },
    riskBannerFree: {
      backgroundColor: colors.redDim, borderColor: 'rgba(248,113,113,0.25)',
    },
    riskBannerTextPro: { flex: 1, fontSize: 12, fontWeight: '500', color: '#60a5fa' },
    riskBannerTextFree: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.red },
    restoreBannerPro: {
      backgroundColor: colors.accentDim, borderColor: colors.accentDimBorder,
    },
    restoreBannerFree: {
      backgroundColor: 'rgba(167,139,250,0.08)', borderColor: 'rgba(167,139,250,0.25)',
    },
    restoreBannerTextPro: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.accent },
    restoreBannerTextFree: { flex: 1, fontSize: 12, fontWeight: '500', color: '#a78bfa' },

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
    fieldHint: { fontSize: 12, color: colors.textDim, marginTop: 6, lineHeight: 16 },
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

    // Habit nudge
    nudgeOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
      paddingHorizontal: spacing.lg,
      paddingBottom: 100,
    },
    nudgeCard: {
      backgroundColor: colors.bgCard,
      borderRadius: radius.lg,
      padding: 28,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 12,
    },
    nudgeIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentDim,
      borderWidth: 1,
      borderColor: colors.accentDimBorder,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    nudgeTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      letterSpacing: -0.3,
    },
    nudgeDesc: {
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 21,
      marginBottom: 24,
    },
    nudgeBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingVertical: 13,
      alignItems: 'center',
      marginBottom: 12,
    },
    nudgeBtnText: {
      color: colors.bg,
      fontSize: 15,
      fontWeight: '700',
    },
    nudgeSkip: {
      alignItems: 'center',
      paddingVertical: 4,
    },
    nudgeSkipText: {
      fontSize: 13,
      color: colors.textDim,
    },
  });
}
