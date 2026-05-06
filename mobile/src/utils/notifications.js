import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from '../api/client';

// Show notification banners when the app is in the foreground too.
//
// IMPORTANT: this runs at module-load time. A native exception thrown here
// would propagate across the JS-to-native bridge BEFORE React's Error
// Boundary is set up, producing the exact RCTNativeModule rethrow signature
// we saw in TestFlight build 23 crashes on iOS 26.1. Wrapping defensively
// so the app can still launch even if the notifications module is in a
// fragile state (e.g. just after install, low memory, or system service
// race). Worst case: foreground banners don't appear; the app still works.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (err) {
  console.warn('[notifications] setNotificationHandler failed at startup:', err && err.message);
}

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Request permission, get the Expo push token, and register it with the backend.
 * Safe to call on every login - the backend just updates the token in place.
 */
export async function registerPushToken() {
  try {
    if (Platform.OS === 'web') return; // web doesn't support push
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await api.put('/users/me/push-token', { token, timezone });
  } catch {
    // Never crash the app over push registration
  }
}

// Compose a stable identifier for a single (habit, time) reminder so the same
// pair always replaces itself when re-scheduled.
function reminderId(habitId, time) {
  return `habit:${habitId}:${time}`;
}

function parseHHMM(t) {
  if (typeof t !== 'string' || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(s => parseInt(s, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
}

function triggerFor(frequency, hour, minute) {
  if (frequency === 'daily' || frequency === 'weekly') {
    // For weekly habits we still fire daily at the set time — counting the
    // user's logs against the weekly target is the backend's job; the local
    // notification just nudges them at the times they chose.
    return { type: 'daily', hour, minute };
  }
  if (frequency === 'monthly') {
    // No native monthly trigger. Schedule a one-shot 5 days before end of month.
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const target = new Date(endOfMonth.getFullYear(), endOfMonth.getMonth(), endOfMonth.getDate() - 4, hour, minute, 0);
    if (target <= now) {
      target.setMonth(target.getMonth() + 1);
    }
    return { date: target };
  }
  return null;
}

/**
 * Schedule (or reschedule) all reminders for a habit. Cancels any previously
 * scheduled reminders for this habit first, then re-creates one local
 * notification per HH:MM string in `habit.reminders` (Pro: up to 10).
 *
 * Backward compatible: if `habit.reminders` is missing/empty but
 * `habit.reminder_time` is set (older mobile clients or pre-migration data),
 * the single time is used.
 */
// Per-habit serialization queue. Two near-simultaneous calls (e.g. user edits
// reminder times then immediately deletes the habit) could otherwise interleave
// the inner getAll → cancel → schedule sequence, leaving stale OS reminders
// firing after the habit no longer exists. Each habit waits for its prior
// op to fully resolve before starting.
const _habitOpQueue = new Map();
function _runSerial(habitId, fn) {
  const key = String(habitId);
  const prev = _habitOpQueue.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  _habitOpQueue.set(key, next);
  // Clean up the map slot once this op (and any chained ones) settle.
  next.finally(() => {
    if (_habitOpQueue.get(key) === next) _habitOpQueue.delete(key);
  });
  return next;
}

export async function scheduleHabitReminder(habit) {
  return _runSerial(habit.id, async () => {
    await _cancelHabitReminderImpl(habit.id);

    let times = Array.isArray(habit.reminders) ? habit.reminders : [];
    if (!times.length && habit.reminder_time) times = [habit.reminder_time];
    if (!times.length) return;

    for (const t of times) {
      const parsed = parseHHMM(t);
      if (!parsed) continue;
      const trigger = triggerFor(habit.frequency, parsed.hour, parsed.minute);
      if (!trigger) continue;
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: reminderId(habit.id, t),
          content: {
            title: 'Stay Dialed',
            body: `Time to ${habit.name}!`,
            data: { habitId: habit.id },
          },
          trigger,
        });
      } catch (err) {
        console.warn('[notifications] schedule failed for', habit.id, t, err && err.message);
      }
    }
  });
}

/**
 * Cancel every scheduled local notification for a habit, regardless of how
 * many reminder times it has. Walks the OS-scheduled list and cancels any
 * whose identifier starts with `habit:<id>:` (multi-reminder format) or
 * matches the legacy single-id scheme `<id>`.
 */
export async function cancelHabitReminder(habitId) {
  return _runSerial(habitId, () => _cancelHabitReminderImpl(habitId));
}

async function _cancelHabitReminderImpl(habitId) {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const idStr = String(habitId);
    const prefix = `habit:${idStr}:`;
    for (const n of all) {
      const ident = n.identifier;
      if (ident === idStr || (typeof ident === 'string' && ident.startsWith(prefix))) {
        await Notifications.cancelScheduledNotificationAsync(ident);
      }
    }
  } catch {
    // Best-effort; missing/native errors must not crash the app.
  }
}

/**
 * Sync all habits: schedule reminders for those with any times set,
 * cancel for those without.
 */
export async function syncAllHabitReminders(habits) {
  if (!Array.isArray(habits)) return;
  for (const habit of habits) {
    const hasReminders =
      (Array.isArray(habit.reminders) && habit.reminders.length > 0) ||
      !!habit.reminder_time;
    if (hasReminders) {
      await scheduleHabitReminder(habit);
    } else {
      await cancelHabitReminder(habit.id);
    }
  }
}
