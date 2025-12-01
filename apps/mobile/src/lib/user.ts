// apps/mobile/src/lib/user.ts

import { auth, db } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
} from "firebase/firestore";
import { fn } from "./functionsClient";
import * as Linking from "expo-linking";
import { Share } from "react-native";

/* ----------------------------------------------------------- */
/* Geolocation settings                                        */
/* ----------------------------------------------------------- */

export type GeolocationSettings = {
  shareLocation: boolean;
  mode: "foreground" | "background";
  intervalMinutes: number;
  lastPermissionStatus: "granted" | "denied" | "undetermined";
};

const DEFAULT_GEOLOCATION_SETTINGS: GeolocationSettings = {
  shareLocation: true,
  mode: "foreground",
  intervalMinutes: 5,
  lastPermissionStatus: "undetermined",
};

/* ----------------------------------------------------------- */
/* User base helpers                                           */
/* ----------------------------------------------------------- */

/**
 * Ensure that users/{uid} document exists.
 */
export async function ensureUserDoc() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  return ref;
}

/**
 * Read user profile
 */
export async function getUserProfile() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: uid, ...(snap.data() as any) } : null;
}

/* ----------------------------------------------------------- */
/* GeolocationSettings helpers (geoSettings в users/{uid})     */
/* ----------------------------------------------------------- */

/**
 * Прочитать настройки геолокации пользователя.
 * Если настроек нет — вернёт null (UI может подсветить первый запуск).
 *
 * uid:
 *  - если не передан, берём auth.currentUser?.uid
 */
export async function getGeolocationSettings(
  uid?: string
): Promise<GeolocationSettings | null> {
  const effUid = uid ?? auth.currentUser?.uid;
  if (!effUid) return null;

  const ref = doc(db, "users", effUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  const raw = data.geoSettings as Partial<GeolocationSettings> | undefined;
  if (!raw) return null;

  // Нормализуем с дефолтами (на случай старых полей)
  return {
    ...DEFAULT_GEOLOCATION_SETTINGS,
    ...raw,
  };
}

/**
 * Обновить настройки геолокации пользоватeля.
 *
 * uid:
 *  - если не передан, берём auth.currentUser?.uid
 *
 * patch:
 *  - частичное обновление, остальное дотягиваем из старых значений/дефолтов.
 */
export async function updateGeolocationSettings(
  uid: string | undefined,
  patch: Partial<GeolocationSettings>
): Promise<void> {
  const effUid = uid ?? auth.currentUser?.uid;
  if (!effUid) throw new Error("No user");

  const ref = doc(db, "users", effUid);

  const existing = await getGeolocationSettings(effUid);
  const merged: GeolocationSettings = {
    ...DEFAULT_GEOLOCATION_SETTINGS,
    ...(existing ?? {}),
    ...patch,
  };

  await setDoc(
    ref,
    {
      geoSettings: merged,
      geoSettingsUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/* ----------------------------------------------------------- */
/* Referral logic                                              */
/* ----------------------------------------------------------- */

/**
 * Build referral link
 */
export async function getReferralLink(): Promise<{
  code: string;
  url: string;
}> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");

  // Try read existing
  const uRef = doc(db, "users", uid);
  const snap = await getDoc(uRef);
  let code: string | null =
    (snap.exists() ? (snap.data() as any).referralCode : null) ?? null;

  if (!code) {
    // Callable must be read from .data
    const call = fn<{}, { ok: boolean; code: string }>("generateReferralCode");
    const res = await call({});
    const data = res.data;

    if (!data.ok || !data.code) {
      throw new Error("Failed to generate referral code");
    }

    code = data.code;
  }

  // Guarantee string to satisfy TS
  const finalCode = code ?? "";

  // Build link
  const url = Linking.createURL("/signup", {
    queryParams: { ref: finalCode },
  });

  return { code: finalCode, url };
}

/**
 * Share referral link
 */
export async function shareReferralLink() {
  const { code, url } = await getReferralLink();

  await Share.share({
    message: `Join GAD Family with my referral code: ${code}\n${url}`,
  });

  return { code, url };
}

/**
 * Read referral stats
 */
export async function readReferralStats(): Promise<{
  totalFamilies: number;
  totalBonusPoints: number;
  items: {
    id: string;
    newFamilyId: string;
    bonusPoints: number;
    ts?: any;
    refCode?: string;
  }[];
}> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");

  const collRef = collection(db, "referrals", uid, "items");
  const snap = await getDocs(collRef);

  const items = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      newFamilyId: data.newFamilyId,
      bonusPoints: data.bonusPoints ?? 0,
      ts: data.ts,
      refCode: data.refCode,
    };
  });

  const totalFamilies = items.length;
  const totalBonusPoints = items.reduce(
    (acc, it) => acc + (it.bonusPoints || 0),
    0
  );

  return { totalFamilies, totalBonusPoints, items };
}
