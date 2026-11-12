import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const REMINDER_CHANNEL_ID = 'task-reminders';
export const DAILY_SUMMARY_NOTIFICATION_ID = 888888;
export const TEST_NOTIFICATION_ID = 999999;

export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  reminder1Day: true,
  reminder1Hour: true,
  reminder15Min: true,
  reminderAtDeadline: true,
  overdueAlerts: true,
  dailySummary: false,
  dailySummaryTime: '08:00',
  sound: true,
  vibration: true
};

/**
 * Loads notification preferences from localStorage.
 */
export function getNotificationSettings() {
  try {
    const saved = localStorage.getItem('studentTaskNotificationSettings');
    if (!saved) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(saved) };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

/**
 * Saves notification preferences to localStorage.
 */
export function saveNotificationSettings(settings) {
  try {
    localStorage.setItem('studentTaskNotificationSettings', JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save notification settings:', error);
  }
}

/**
 * Generates a stable, unique 32-bit positive integer notification ID
 * for a specific task and reminder type.
 */
export function getNotificationId(taskId, reminderType) {
  const str = `${taskId}-${reminderType}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  // Safe 32-bit positive int within Android notification range (1 to 2,000,000,000)
  return Math.abs(hash % 2000000000) + 1;
}

/**
 * Parses task deadline into a Date object.
 */
export function getTaskDeadlineDateTime(task) {
  if (!task || !task.dueDate) return null;
  const time = task.dueTime || task.endTime || '09:00';
  const isoString = `${task.dueDate}T${time}:00`;
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Checks if a task is overdue.
 */
export function isTaskOverdue(task) {
  if (!task || task.completed || !task.dueDate) return false;
  const deadline = getTaskDeadlineDateTime(task);
  if (!deadline) return false;
  return deadline.getTime() < Date.now();
}

/**
 * Creates the Android notification channel with high priority.
 */
export async function setupNotificationChannel() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Task Deadlines & Reminders',
      description: 'Notifications for student task deadlines, reminders, and summaries',
      importance: 5, // High priority banner & sound
      visibility: 1, // Visible on lockscreen
      vibration: true,
      lights: true,
      lightColor: '#4f46e5'
    });
  } catch (error) {
    console.error('Failed to create notification channel:', error);
  }
}

/**
 * Checks permission status.
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
 * Requests permission.
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
 * Builds the array of scheduled notification objects for a single task
 * according to user settings and deadline intervals.
 */
export function buildTaskReminders(task, settings = getNotificationSettings()) {
  if (!settings.enabled || task.completed) return [];

  const deadline = getTaskDeadlineDateTime(task);
  if (!deadline) return [];

  const deadlineTime = deadline.getTime();
  const now = Date.now();
  const timeFormatted = deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const reminders = [];

  // 1. First reminder: 1 day before (24 hours)
  if (settings.reminder1Day) {
    const oneDayBefore = deadlineTime - 24 * 60 * 60 * 1000;
    if (oneDayBefore > now) {
      reminders.push({
        id: getNotificationId(task.id, '1_day_before'),
        title: `📚 ${task.title} is due tomorrow!`,
        body: task.notes ? `${task.notes} (Due at ${timeFormatted})` : `Deadline is tomorrow at ${timeFormatted}.`,
        channelId: REMINDER_CHANNEL_ID,
        schedule: { at: new Date(oneDayBefore), allowWhileIdle: true }
      });
    }
  }

  // 2. Second reminder: 1 hour before (60 minutes)
  if (settings.reminder1Hour) {
    const oneHourBefore = deadlineTime - 60 * 60 * 1000;
    if (oneHourBefore > now) {
      reminders.push({
        id: getNotificationId(task.id, '1_hour_before'),
        title: `⏰ ${task.title} is due in 1 hour!`,
        body: task.notes ? `${task.notes} (Due at ${timeFormatted})` : `Deadline is in 1 hour at ${timeFormatted}.`,
        channelId: REMINDER_CHANNEL_ID,
        schedule: { at: new Date(oneHourBefore), allowWhileIdle: true }
      });
    }
  }

  // 3. Final reminder: 15 minutes before
  if (settings.reminder15Min) {
    const fifteenMinBefore = deadlineTime - 15 * 60 * 1000;
    if (fifteenMinBefore > now) {
      reminders.push({
        id: getNotificationId(task.id, '15_min_before'),
        title: `🚨 Only 15 minutes left to complete ${task.title}!`,
        body: task.notes ? `${task.notes} - Complete it now!` : `Deadline is at ${timeFormatted}!`,
        channelId: REMINDER_CHANNEL_ID,
        schedule: { at: new Date(fifteenMinBefore), allowWhileIdle: true }
      });
    }
  }

  // 4. Exact deadline reminder
  if (settings.reminderAtDeadline) {
    if (deadlineTime > now) {
      reminders.push({
        id: getNotificationId(task.id, 'deadline'),
        title: `⌛ Deadline reached: ${task.title}`,
        body: `Deadline reached at ${timeFormatted}! Please mark as completed.`,
        channelId: REMINDER_CHANNEL_ID,
        schedule: { at: deadline, allowWhileIdle: true }
      });
    }
  }

  return reminders;
}

/**
 * Builds optional daily summary notification.
 */
export function buildDailySummaryReminder(tasks, settings = getNotificationSettings()) {
  if (!settings.enabled || !settings.dailySummary) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const tasksDueToday = tasks.filter((t) => !t.completed && t.dueDate === todayStr);
  const count = tasksDueToday.length;

  const summaryTime = settings.dailySummaryTime || '08:00';
  const [hours, minutes] = summaryTime.split(':').map((val) => Number.parseInt(val, 10) || 0);

  const scheduleDate = new Date();
  scheduleDate.setHours(hours, minutes, 0, 0);
  if (scheduleDate.getTime() <= Date.now()) {
    scheduleDate.setDate(scheduleDate.getDate() + 1);
  }

  return {
    id: DAILY_SUMMARY_NOTIFICATION_ID,
    title: '🌅 Good Morning! Student Tasks',
    body: count > 0
      ? `You have ${count} ${count === 1 ? 'task' : 'tasks'} scheduled for today.`
      : 'You have no tasks due today. Great time to catch up or plan ahead!',
    channelId: REMINDER_CHANNEL_ID,
    schedule: {
      at: scheduleDate,
      allowWhileIdle: true,
      repeats: true,
      every: 'day'
    }
  };
}

/**
 * Cancels all possible scheduled reminders for a specific task.
 */
export async function cancelTaskNotifications(taskId) {
  if (!taskId) return;

  const reminderTypes = ['1_day_before', '1_hour_before', '15_min_before', 'deadline', 'overdue'];
  const notificationsToCancel = reminderTypes.map((type) => ({
    id: getNotificationId(taskId, type)
  }));

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({ notifications: notificationsToCancel });
    } catch (error) {
      console.warn(`Error cancelling notifications for task ${taskId}:`, error);
    }
  }
}

/**
 * Schedules all pending reminders for all active tasks, plus optional daily summary.
 */
export async function syncAllTaskNotifications(tasks, settings = getNotificationSettings()) {
  if (!Array.isArray(tasks)) return [];

  const allReminders = [];
  if (settings.enabled) {
    for (const task of tasks) {
      if (!task.completed) {
        allReminders.push(...buildTaskReminders(task, settings));
      }
    }

    const summaryReminder = buildDailySummaryReminder(tasks, settings);
    if (summaryReminder) {
      allReminders.push(summaryReminder);
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const pending = await LocalNotifications.getPending();
      if (pending && Array.isArray(pending.notifications) && pending.notifications.length > 0) {
        // Exclude test notification
        const cancelList = pending.notifications
          .filter((n) => n.id !== TEST_NOTIFICATION_ID)
          .map((n) => ({ id: n.id }));

        if (cancelList.length > 0) {
          await LocalNotifications.cancel({ notifications: cancelList });
        }
      }

      if (allReminders.length > 0 && settings.enabled) {
        await setupNotificationChannel();
        const hasPermission = await checkPermissions();
        if (hasPermission) {
          await LocalNotifications.schedule({ notifications: allReminders });
        }
      }

      localStorage.setItem(
        'studentTaskReminderIds',
        JSON.stringify(allReminders.map((r) => r.id))
      );
    } catch (error) {
      console.error('Failed to sync native notifications:', error);
    }
  }

  return allReminders;
}

/**
 * 10-second test notification.
 */
export async function scheduleTestNotification(delaySeconds = 10) {
  const hasPermission = await requestPermissions();
  if (!hasPermission) {
    throw new Error('Notification permission was not granted. Please enable notifications in your device settings.');
  }

  const triggerTime = new Date(Date.now() + delaySeconds * 1000);

  if (Capacitor.isNativePlatform()) {
    await setupNotificationChannel();
    await LocalNotifications.cancel({ notifications: [{ id: TEST_NOTIFICATION_ID }] }).catch(() => {});

    await LocalNotifications.schedule({
      notifications: [
        {
          id: TEST_NOTIFICATION_ID,
          title: '🎉 Notification System Working!',
          body: `This reminder arrived 10 seconds after scheduling. It works even when the app is closed!`,
          channelId: REMINDER_CHANNEL_ID,
          schedule: {
            at: triggerTime,
            allowWhileIdle: true
          }
        }
      ]
    });
  } else {
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
