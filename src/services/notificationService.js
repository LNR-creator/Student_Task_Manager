import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const REMINDER_CHANNEL_ID = 'task-reminders';

/**
 * Creates the Android notification channel with high priority
 * so notifications display banners, vibrate, and alert the user even when the app is closed.
 */
export async function setupNotificationChannel() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Task Deadlines & Reminders',
      description: 'Notifications for student task deadlines, reminders, and summaries',
      importance: 5, // High importance (heads-up banner, sound, vibration)
      visibility: 1, // Visible on lock screen
      vibration: true,
      lights: true,
      lightColor: '#4f46e5'
    });
  } catch (error) {
    console.error('Failed to create notification channel:', error);
  }
}

/**
 * Checks current notification permission status.
 */
export async function checkPermissions() {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      return status.display === 'granted';
    } catch (error) {
      console.error('Error checking native permissions:', error);
      return false;
    }
  }

  if ('Notification' in window) {
    return Notification.permission === 'granted';
  }

  return false;
}

/**
 * Requests notification permissions from the user.
 */
export async function requestPermissions() {
  if (Capacitor.isNativePlatform()) {
    try {
      await setupNotificationChannel();
      const status = await LocalNotifications.requestPermissions();
      return status.display === 'granted';
    } catch (error) {
      console.error('Error requesting native permissions:', error);
      return false;
    }
  }

  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

/**
 * Schedules a test notification to trigger after a delay (default: 10 seconds).
 * Works when app is active, backgrounded, or completely closed.
 */
export async function scheduleTestNotification(delaySeconds = 10) {
  const hasPermission = await requestPermissions();
  if (!hasPermission) {
    throw new Error('Notification permission was not granted. Please enable notifications in your device settings.');
  }

  const triggerTime = new Date(Date.now() + delaySeconds * 1000);
  const testId = 999999;

  if (Capacitor.isNativePlatform()) {
    await setupNotificationChannel();
    // Cancel any existing test notification before scheduling
    await LocalNotifications.cancel({ notifications: [{ id: testId }] }).catch(() => {});

    await LocalNotifications.schedule({
      notifications: [
        {
          id: testId,
          title: '🎉 Notification System Working!',
          body: `This reminder arrived 10 seconds after scheduling. It works even when the app is closed!`,
          channelId: REMINDER_CHANNEL_ID,
          schedule: {
            at: triggerTime,
            allowWhileIdle: true // Ensures delivery even under Android battery optimization / Doze mode
          }
        }
      ]
    });
  } else {
    // Web fallback for browser preview
    setTimeout(() => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🎉 Notification System Working!', {
          body: 'This reminder arrived 10 seconds after scheduling (Web mode).'
        });
      }
    }, delaySeconds * 1000);
  }

  return triggerTime;
}

