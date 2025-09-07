// apps/mobile/src/services/pushService.ts
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { db, auth } from "../firebase";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function registerForPush() {
  // iOS: запрос разрешения
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    console.log("Push permission denied");
    return null;
  }

  // Получаем Expo push token (в Expo Go/Managed)
  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // Сохраняем у пользователя (как временное поле expoTokens[])
  const uid = auth.currentUser?.uid;
  if (!uid) return token;

  const ref = doc(db, "users", uid);
  await setDoc(ref, { expoTokens: [] }, { merge: true });
  await updateDoc(ref, { expoTokens: arrayUnion(token) });

  return token;
}
