// apps/mobile/src/lib/notifications.ts
import * as Notifications from "expo-notifications";

// Глобальный хендлер отображения (SDK 53)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    // новые поля для iOS 17+/SDK 53
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const { status: s2 } = await Notifications.requestPermissionsAsync();
    return s2 === "granted";
  }
  return true;
}

/**
 * Ежедневное локальное напоминание по времени.
 * Тип строго Calendar trigger => указываем type.
 */
export async function scheduleDailyReminder(hour = 20, minute = 0) {
  const ok = await ensureNotificationPermission();
  if (!ok) return false;

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
