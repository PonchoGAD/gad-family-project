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
import {
  getStorage,
  connectStorageEmulator,
} from "firebase/storage";

// ---------- ENV из Expo (.env в apps/mobile или app.config.ts) ----------
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

// Небольшая защита: если что-то не задано — увидишь в логах Expo
Object.entries(firebaseConfig).forEach(([k, v]) => {
  if (!v) {
    console.warn(
      `[firebase] Missing env for ${k}. Check EXPO_PUBLIC_* variables in apps/mobile/.env`
    );
  }
});

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig as any);

// ---------- Auth (React Native) ----------
const auth = (() => {
  try {
    const getRNP = (Auth as any).getReactNativePersistence;
    return (Auth as any).initializeAuth(app, {
      persistence: getRNP ? getRNP(AsyncStorage) : undefined,
    }) as Auth.Auth;
  } catch {
    return Auth.getAuth(app);
  }
})();

// ---------- Firestore / Functions / Storage ----------
const db = getFirestore(app);

// регион функций — сначала публичный EXPO_PUBLIC_, потом FUNCTIONS_REGION, потом дефолт
const functionsRegion =
  process.env.EXPO_PUBLIC_FUNCTIONS_REGION ||
  process.env.FUNCTIONS_REGION ||
  "us-east4";

const functions = getFunctions(app, functionsRegion);
const storage = getStorage(app);

// ---------- Эмуляторы (по флагу) ----------
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

// ---------- Хелпер для callable-функций ----------
const makeCall =
  <TReq = any, TRes = any>(name: string) =>
  async (data?: TReq) =>
    (await httpsCallable(functions, name)(data)) as any;

// ---------- Единый объект fn (используется экранами) ----------
export const fn = {
  // Гео-модуль
  geo: {
    ping: makeCall<
      { lat: number; lng: number; acc: number | null },
      { ok: boolean }
    >("geo_ping"),
    places: makeCall<{ q: string }, { ok: boolean; items: any[] }>(
      "geo_places"
    ),
    history: makeCall<
      { from?: number; to?: number },
      { ok: boolean; items: any[] }
    >("geo_history"),
    setPlace: makeCall<{
      placeId: string;
      type: string;
      title: string;
      center: [number, number];
      radiusM: number;
    }, { ok: boolean }>("geo_setPlace"),
  },

  // Легаси-алиасы по старым именам
  locationPing: makeCall<
    { lat: number; lng: number; acc: number | null },
    { ok: boolean }
  >("geo_ping"),
  getLocationHistory: makeCall<
    { targetUid?: string; fromISO?: string; toISO?: string },
    { ok: boolean; items: any[] }
  >("geo_history"),
  setPlace: makeCall<{
    placeId: string;
    type: string;
    title: string;
    center: [number, number];
    radiusM: number;
  }, { ok: boolean }>("geo_setPlace"),

  // Step Engine (кнопка Run dry-run now)
  stepEngineRunNow: makeCall<
    unknown,
    { ok: boolean; processed: number; date: string }
  >("stepEngineRunNow"),

  // Профиль / приватность (используются в ProfileDOBScreen и PrivacyScreen)
  registerBirthdate: makeCall<
    { dob: string },
    { age: number; isAdult: boolean }
  >("registerBirthdate"),
  setGeoPreference: makeCall<
    { enabled: boolean },
    { ok: boolean }
  >("setGeoPreference"),
};

export {
  app,
  auth,
  db,
  functions,
  storage,
  getFirestore,
  getFunctions,
  httpsCallable,
};
