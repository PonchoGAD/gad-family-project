// apps/mobile/src/lib/checkins.ts
// ------------------------------------------------------
// Family check-ins (единый хелпер V2):
//   families/{fid}/checkIns/{checkInId}
//   families/{fid}/alerts/{alertId}  (type: "check_in")
//
// Используется для:
//  - обычных check-in'ов (дом, школа, работа, кастом);
//  - пуш-алертов семье (через functions/src/familyAlerts.ts);
//
// Поддерживает ДВА формата вызова (ради обратной совместимости):
//
//  1) Новый формат (рекомендованный):
//       createCheckIn(fid, { label, note?, lat?, lng? })
//
//  2) Старый формат (legacy):
//       createCheckIn({ fid, placeName, lat?, lng?, uid? })
//
// В обоих случаях в Firestore поля будут:
//   checkIns: { type: "check_in", uid, placeName, label, note, lat, lng, createdAt }
//   alerts  : { type: "check_in", uid, placeName, label, note, lat, lng, createdAt }
// ------------------------------------------------------

import { auth, db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// Новый формат
export type CheckInPayload = {
  label: string;        // "Home", "School", "Work", "Custom"
  note?: string;        // опциональный комментарий
  lat?: number | null;  // опционально: координаты на момент check-in
  lng?: number | null;
};

// Старый формат (legacy)
export interface CheckInInput {
  fid: string;
  placeName: string;
  lat?: number | null;
  lng?: number | null;
  uid?: string;
}

// Внутренняя нормализация аргументов
type NormalizedCheckIn = {
  fid: string;
  uid: string | null;
  placeName: string; // основное имя точки (унифицировано)
  label: string;     // дублируем для удобства UI/аналитики
  note: string | null;
  lat: number | null;
  lng: number | null;
};

function normalizeCheckInArgs(
  arg1: string | CheckInInput,
  arg2?: CheckInPayload
): NormalizedCheckIn {
  const currentUid = auth.currentUser?.uid || null;

  // Формат: createCheckIn({ fid, placeName, ... })
  if (typeof arg1 !== "string") {
    const input = arg1 as CheckInInput;
    const fid = input.fid;
    const placeName = (input.placeName || "").trim();

    if (!fid) {
      throw new Error("[checkins] fid is required");
    }
    if (!placeName) {
      throw new Error("[checkins] placeName is required");
    }

    return {
      fid,
      uid: input.uid ?? currentUid,
      placeName,
      label: placeName, // в legacy label = placeName
      note: null,
      lat:
        typeof input.lat === "number"
          ? input.lat
          : null,
      lng:
        typeof input.lng === "number"
          ? input.lng
          : null,
    };
  }

  // Формат: createCheckIn(fid, { label, ... })
  const fid = arg1;
  const payload = arg2 as CheckInPayload | undefined;

  if (!fid) {
    throw new Error("[checkins] Family ID is required for check-in");
  }
  if (!payload || !payload.label || !payload.label.trim()) {
    throw new Error("[checkins] Check-in label is required");
  }

  const label = payload.label.trim();
  const note = payload.note?.trim() || null;

  return {
    fid,
    uid: currentUid,
    placeName: label, // для алертов и совместимости используем то же имя
    label,
    note,
    lat:
      typeof payload.lat === "number"
        ? payload.lat
        : null,
    lng:
      typeof payload.lng === "number"
        ? payload.lng
        : null,
  };
}

// Перегрузки для TypeScript (чтобы везде корректно подсказывало типы)
export async function createCheckIn(input: CheckInInput): Promise<void>;
export async function createCheckIn(
  fid: string,
  payload: CheckInPayload
): Promise<void>;

// Реализация
export async function createCheckIn(
  arg1: string | CheckInInput,
  arg2?: CheckInPayload
): Promise<void> {
  const norm = normalizeCheckInArgs(arg1, arg2);

  const { fid, uid, placeName, label, note, lat, lng } = norm;

  const checkInsRef = collection(db, "families", fid, "checkIns");
  const alertsRef = collection(db, "families", fid, "alerts");

  const base = {
    uid: uid ?? null,
    placeName,   // для familyAlerts / пушей
    label,       // для UI/аналитики
    note,
    lat,
    lng,
    createdAt: serverTimestamp(),
  };

  // 1) Check-in для истории
  await addDoc(checkInsRef, {
    ...base,
    type: "check_in",
  });

  // 2) Alert для пушей
  await addDoc(alertsRef, {
    ...base,
    type: "check_in",
  });
}
