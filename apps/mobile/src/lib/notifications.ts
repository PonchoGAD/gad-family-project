// apps/mobile/src/lib/notifications.ts
import * as Notifications from "expo-notifications";

// Global handler for how notifications are displayed
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    // iOS 17+/SDK 53 extra flags
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Ask for notification permission if not granted yet.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const { status: s2 } = await Notifications.requestPermissionsAsync();
    return s2 === "granted";
  }
  return true;
}

/**
 * Daily local reminder at given time.
 * Uses Calendar trigger (SDK 53+).
 */
export async function scheduleDailyReminder(
  hour = 20,
  minute = 0
): Promise<boolean> {
  const ok = await ensureNotificationPermission();
  if (!ok) return false;

  // reset existing schedules to avoid duplicates
  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "GAD Family",
      body: "Don’t forget to save today’s steps and earn GAD Points!",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute,
      repeats: true,
    },
  });

  return true;
}
