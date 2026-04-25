import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from '../api/client';

// Show notification banners when the app is in the foreground too
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
    await api.put('/users/me/push-token', { token });
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

  if (!habit.reminder_time) return;

  const [hourStr, minuteStr] = habit.reminder_time.split(':');
  const hour   = parseInt(hourStr,   10);
  const minute = parseInt(minuteStr, 10);

  if (isNaN(hour) || isNaN(minute)) return;

  let trigger;

  if (habit.frequency === 'daily') {
    trigger = { type: 'daily', hour, minute, repeats: true };
  } else if (habit.frequency === 'weekly') {
    // Fire every Monday at the specified time
    trigger = { type: 'weekly', weekday: 2, hour, minute, repeats: true };
  } else if (habit.frequency === 'monthly') {
    // Fire on the 1st of each month
    // expo-notifications doesn't have a native monthly trigger, so use
    // a calendar trigger for the 1st day of the next occurring month
    const now  = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, hour, minute, 0);
    trigger    = { date: next, repeats: false };
  } else {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: habit.id,
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
    await Notifications.cancelScheduledNotificationAsync(habitId);
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
