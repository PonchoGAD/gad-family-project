// apps/mobile/src/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import * as Auth from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// ENV берём из Expo (app.config / .env.*)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

// --- Auth (инициализируем для React Native) ---
let auth: Auth.Auth;
try {
  // если уже инициализирован
  auth = Auth.getAuth(app);
} catch {
  // RN-персистенс (обойти несовпадение типов через any)
  const getRNP = (Auth as any).getReactNativePersistence;
  auth = Auth.initializeAuth(app, {
    persistence: getRNP ? getRNP(AsyncStorage) : undefined,
  });
}

// --- Firestore / Functions / Storage ---
const db = getFirestore(app);
const functions = getFunctions(app, process.env.FUNCTIONS_REGION || "us-east1");
const storage = getStorage(app);

// --- Подключение к эмуляторам (по флагу) ---
const USE_EMULATOR =
  process.env.USE_EMULATOR === "true" ||
  process.env.EXPO_PUBLIC_USE_EMULATOR === "true";

if (USE_EMULATOR) {
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch {}
  try {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  } catch {}
  try {
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  } catch {}
}

// --- Помощник для вызовов callable ---
const call = <T = any, R = any>(name: string) => async (data?: T) =>
  (await httpsCallable(functions, name)(data)) as any;

// --- Нужные сейчас функции (geo) + топ-алиасы для совместимости ---
export const fn = {
  geo: {
    ping: call<{ lat: number; lng: number; acc: number | null }, { ok: true }>(
      "geo_ping"
    ),
    places: call<{ q: string }, { ok: true; items: any[] }>("geo_places"),
    history: call<{ from?: number; to?: number }, { ok: true; items: any[] }>(
      "geo_history"
    ),
    // опционально, если на бэке есть setPlace:
    setPlace: call<{
      placeId: string;
      type: string;
      title: string;
      center: [number, number];
      radiusM: number;
    }, { ok: true }>("geo_setPlace"),
  },

  // ЛЕГАСИ-АПИ (чтобы не переписывать существующие экраны)
  locationPing: call<{ lat: number; lng: number; acc: number | null }, { ok: true }>(
    "geo_ping"
  ),
  getLocationHistory: call<
    { targetUid?: string; fromISO?: string; toISO?: string },
    { ok: true; items: any[] }
  >("geo_history"),
  setPlace: call<
    { placeId: string; type: string; title: string; center: [number, number]; radiusM: number },
    { ok: true }
  >("geo_setPlace"),
};

export { app, auth, db, functions, storage };
