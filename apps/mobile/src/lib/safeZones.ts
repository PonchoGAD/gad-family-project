// apps/mobile/src/lib/safeZones.ts
// ------------------------------------------------------
// Клиентские хелперы для Safe Zones:
//  - emitSafeZoneEnter
//  - emitSafeZoneExit
//  - emitSafeZoneWarning
//
// Пишут документы в:
//   families/{fid}/geoEvents/{eventId}
//
// Серверная функция onSafeZoneEvent (safeZones.ts)
// ловит эти документы и шлёт пуш семье.
// ------------------------------------------------------

import { auth, db } from "../firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

export type SafeZoneEventType = "enter" | "exit" | "warning";

export interface SafeZoneEventPayload {
  fid: string;
  zoneId: string;
  zoneName?: string;
  type: SafeZoneEventType;
  reason?: string;
  uid?: string; // по умолчанию currentUser.uid
}

async function emitSafeZoneEvent(input: SafeZoneEventPayload) {
  const currentUid = auth.currentUser?.uid || null;

  const {
    fid,
    zoneId,
    zoneName,
    type,
    reason,
    uid = currentUid || undefined,
  } = input;

  if (!fid) {
    console.log("[safeZones] emitSafeZoneEvent: missing fid");
    return;
  }

  const colRef = collection(db, "families", fid, "geoEvents");

  await addDoc(colRef, {
    type,
    zoneId,
    zoneName: zoneName ?? null,
    uid: uid ?? null,
    reason: reason ?? null,
    createdAt: serverTimestamp(),
    // можно добавить точные координаты, если нужно
  });
}

// ---- Public helpers ----

export async function emitSafeZoneEnter(params: {
  fid: string;
  zoneId: string;
  zoneName?: string;
  uid?: string;
}) {
  await emitSafeZoneEvent({
    ...params,
    type: "enter",
  });
}

export async function emitSafeZoneExit(params: {
  fid: string;
  zoneId: string;
  zoneName?: string;
  uid?: string;
}) {
  await emitSafeZoneEvent({
    ...params,
    type: "exit",
  });
}

export async function emitSafeZoneWarning(params: {
  fid: string;
  zoneId: string;
  zoneName?: string;
  uid?: string;
  reason: string;
}) {
  await emitSafeZoneEvent({
    ...params,
    type: "warning",
    reason: params.reason,
  });
}
