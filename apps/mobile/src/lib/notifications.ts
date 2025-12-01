// apps/mobile/src/lib/notifications.ts
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// Тип статуса для push-разрешений
export type PushPermissionStatus = "granted" | "denied";

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
 * (старый helper, оставляем для локальных напоминаний)
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
 * Более явный helper под push-токены.
 * Возвращает "granted" | "denied".
 */
export async function requestPushPermissions(): Promise<PushPermissionStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") {
      return "granted";
    }

    const { status: s2 } = await Notifications.requestPermissionsAsync();
    if (s2 === "granted") {
      return "granted";
    }

    return "denied";
  } catch (e) {
    console.log("[notifications] requestPushPermissions error", e);
    return "denied";
  }
}

/**
 * Получить Expo push token (или FCM, если так настроено).
 * Если не удалось или нет разрешений — возвращает null.
 */
export async function getExpoPushTokenOrFCM(): Promise<string | null> {
  try {
    // Для Expo SDK 49+ / 53 в проде нужен projectId.
    // В типах expo-constants expoConfig/easConfig не описаны,
    // поэтому берём их через any, чтобы не ругался TypeScript.
    const anyConstants = Constants as any;

    const projectId: string | undefined =
      anyConstants?.expoConfig?.extra?.eas?.projectId ??
      anyConstants?.easConfig?.projectId;

    const response = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : {}
    );

    const token = response.data;
    if (typeof token === "string" && token.length > 0) {
      return token;
    }

    return null;
  } catch (e) {
    console.log("[notifications] getExpoPushTokenOrFCM error", e);
    return null;
  }
}

/**
 * Зарегистрировать push-токен пользователя в Firestore (users/{uid}.pushToken),
 * если:
 *  - есть авторизованный uid
 *  - пользователь дал разрешение на уведомления
 *  - удалось получить push-токен
 *
 * Если разрешений нет — возвращаем { status: "denied" }.
 */
export async function registerPushTokenIfNeeded(): Promise<
  | { status: "granted"; token: string | null }
  | { status: "denied" }
> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    console.log("[notifications] registerPushTokenIfNeeded: no auth user");
    return { status: "denied" };
  }

  // 1) Разрешения
  const perm = await requestPushPermissions();
  if (perm === "denied") {
    return { status: "denied" };
  }

  // 2) Проверим, есть ли уже токен — чтобы не дёргать лишний раз
  try {
    const uRef = doc(db, "users", uid);
    const snap = await getDoc(uRef);
    const data = snap.data() as any | undefined;
    const existingToken = data?.pushToken as string | undefined;

    // 3) Получаем свежий токен (может поменяться при переустановке и т.п.)
    const token = await getExpoPushTokenOrFCM();
    if (!token) {
      console.log("[notifications] no push token from getExpoPushTokenOrFCM");
      return { status: "denied" };
    }

    // Если токен не изменился — всё равно можно вернуть "granted"
    if (existingToken === token) {
      return { status: "granted", token };
    }

    // 4) Пишем в users/{uid}
    await setDoc(
      uRef,
      {
        pushToken: token,
        pushTokenProvider: "expo", // либо "fcm", если позже поменяешь провайдера
        pushTokenUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { status: "granted", token };
  } catch (e) {
    console.log("[notifications] registerPushTokenIfNeeded error", e);
    return { status: "denied" };
  }
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
