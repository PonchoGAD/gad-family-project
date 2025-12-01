// apps/mobile/src/lib/alerts.ts
// ------------------------------------------------------
// Family alerts:
//  - SOS
//  - low battery
//  - location lost
//
// Пишут документы в:
//   families/{fid}/alerts/{alertId}
//
// Серверный триггер onFamilyAlert отправляет пуши.
// ------------------------------------------------------

import { auth, db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function emitSOSAlert(fid: string, uid?: string) {
  const currentUid = auth.currentUser?.uid || null;

  const colRef = collection(db, "families", fid, "alerts");
  await addDoc(colRef, {
    type: "sos",
    uid: uid ?? currentUid ?? null,
    createdAt: serverTimestamp(),
  });
}

export async function emitLowBatteryAlert(
  fid: string,
  level: number,
  uid?: string
) {
  const currentUid = auth.currentUser?.uid || null;

  const colRef = collection(db, "families", fid, "alerts");
  await addDoc(colRef, {
    type: "low_battery",
    uid: uid ?? currentUid ?? null,
    level,
    createdAt: serverTimestamp(),
  });
}

export async function emitLocationLostAlert(fid: string, uid?: string) {
  const currentUid = auth.currentUser?.uid || null;

  const colRef = collection(db, "families", fid, "alerts");
  await addDoc(colRef, {
    type: "location_lost",
    uid: uid ?? currentUid ?? null,
    createdAt: serverTimestamp(),
  });
}
