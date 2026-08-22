import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * One daily local reminder. Local-only on purpose: a nudge to take today's
 * photo needs no server, and keeping it local means the reminder works even
 * with sync fully disabled.
 */

const CHANNEL = 'daily-checkin';

export async function ensureNotificationSetup(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Daily check-in',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 120],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
}

export async function requestReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function scheduleDailyReminder(hour: number): Promise<void> {
  await cancelDailyReminder();
  await ensureNotificationSetup();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Today is not logged yet',
      body: 'One photo keeps the streak alive.',
      ...(Platform.OS === 'android' ? { channelId: CHANNEL } : null),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
