// apps/mobile/src/services/pushService.ts
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { db, auth } from "../firebase";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { ensureNotificationPermission } from "../lib/notifications";

/**
 * Register device for push notifications and store Expo push token in Firestore.
 */
export async function registerForPush() {
  // iOS / Android: make sure we have permission (uses shared helper)
  const ok = await ensureNotificationPermission();
  if (!ok) {
    console.log("Push permission denied");
    return null;
  }

  // Get Expo push token
  // For newer Expo SDKs you can optionally pass projectId here if needed.
  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  const token = tokenResponse.data;

  const uid = auth.currentUser?.uid;
  if (!uid) {
    // no user yet – return token so you can attach it later if needed
    return token;
  }

  const ref = doc(db, "users", uid);

  // Make sure field exists and then append token
  await setDoc(ref, { expoTokens: [] }, { merge: true });
  await updateDoc(ref, { expoTokens: arrayUnion(token) });

  return token;
}
