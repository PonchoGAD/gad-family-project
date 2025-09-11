// apps/mobile/src/services/pushService.ts
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { db, auth } from "../firebase";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});


export async function registerForPush() {
  // iOS: сначала запросим разрешения
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const r = await Notifications.requestPermissionsAsync();
    if (r.status !== "granted") {
      console.log("Push permission denied");
      return null;
    }
  }

  // Получаем Expo push token
  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // Сохраняем у пользователя
  const uid = auth.currentUser?.uid;
  if (!uid) return token;

  const ref = doc(db, "users", uid);
  await setDoc(ref, { expoTokens: [] }, { merge: true });
  await updateDoc(ref, { expoTokens: arrayUnion(token) });

  return token;
}
