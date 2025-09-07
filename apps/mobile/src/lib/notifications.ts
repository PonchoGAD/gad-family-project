import * as Notifications from "expo-notifications";

export async function ensureNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const { status: s2 } = await Notifications.requestPermissionsAsync();
    return s2 === "granted";
  }
  return true;
}

export async function scheduleDailyReminder(hour = 20, minute = 0) {
  await ensureNotificationPermission();
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "GAD Family",
      body: "Don’t forget to save today’s steps and earn GAD Points!",
    },
    trigger: { hour, minute, repeats: true }
  });
}
