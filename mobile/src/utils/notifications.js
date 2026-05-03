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

/**
 * Schedule (or reschedule) a daily/weekly reminder for a habit.
 * Uses the habit's id as the notification identifier so it can be
 * cancelled or replaced cleanly.
 *
 * @param {object} habit  - must have id, name, frequency, reminder_time ("HH:MM")
 */
export async function scheduleHabitReminder(habit) {
  // Always cancel the previous notification for this habit first
  await cancelHabitReminder(habit.id);

  if (!habit.reminder_time || typeof habit.reminder_time !== 'string' || !habit.reminder_time.includes(':')) return;

  const [hourStr, minuteStr] = habit.reminder_time.split(':');
  const hour   = parseInt(hourStr,   10);
  const minute = parseInt(minuteStr, 10);

  if (isNaN(hour) || isNaN(minute)) return;

  let trigger;

  if (habit.frequency === 'daily') {
    trigger = { type: 'daily', hour, minute };
  } else if (habit.frequency === 'weekly') {
    // Fire every Monday at the specified time
    trigger = { type: 'weekly', weekday: 2, hour, minute };
  } else if (habit.frequency === 'monthly') {
    // expo-notifications has no native monthly repeat trigger.
    // Schedule a one-shot for 5 days before end of the current month as a
    // "last chance" nudge. The server-side cron (POST /api/cron/habit-reminders)
    // is the primary recurring reminder; this is a local fallback.
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day this month
    const nudgeDate = new Date(endOfMonth.getFullYear(), endOfMonth.getMonth(), endOfMonth.getDate() - 4, hour, minute, 0);
    // If that date has already passed this month, push to next month
    const target = nudgeDate > now
      ? nudgeDate
      : new Date(now.getFullYear(), now.getMonth() + 2, 0);
    if (target !== nudgeDate) {
      target.setDate(target.getDate() - 4);
      target.setHours(hour, minute, 0, 0);
    }
    trigger = { date: target };
  } else {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: String(habit.id),
    content: {
      title: 'Stay Dialed',
      body: `Time to ${habit.name}!`,
      data: { habitId: habit.id },
    },
    trigger,
  });
}

export async function cancelHabitReminder(habitId) {
  try {
    await Notifications.cancelScheduledNotificationAsync(String(habitId));
  } catch {
    // Notification may not exist - that's fine
  }
}

/**
 * Sync all habits: schedule reminders for those with reminder_time,
 * cancel for those without.
 */
export async function syncAllHabitReminders(habits) {
  for (const habit of habits) {
    if (habit.reminder_time) {
      await scheduleHabitReminder(habit);
    } else {
      await cancelHabitReminder(habit.id);
    }
  }
}
