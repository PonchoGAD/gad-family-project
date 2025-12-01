// apps/mobile/src/lib/stepEngineClient.ts
// ------------------------------------------------------
// Step Engine V2 — клиентские хелперы для "сегодня":
//  - чтение шагов из dailySteps/{uid}/days/{todayKey}
//  - чтение награды из rewards/{uid}/days/{todayKey}
// Используется в HomeScreen и StepsScreen, чтобы не дублировать Firestore-логику.
// ------------------------------------------------------

import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { todayKey } from "./steps";
import type { RewardDayDoc } from "./stepEngineTypes";

/**
 * Прочитать шаги за сегодня из dailySteps/{uid}/days/{todayKey()}.
 * Возвращает:
 *  - number (0+) если документ есть;
 *  - null, если документа нет.
 */
export async function fetchTodaySteps(uid: string): Promise<number | null> {
  const key = todayKey();
  const snap = await getDoc(doc(db, "dailySteps", uid, "days", key));
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  const raw =
    data.steps ??
    data.totalSteps ??
    0;

  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Прочитать награду Step Engine V2 за сегодня:
 * rewards/{uid}/days/{todayKey()}.
 *
 * Возвращает:
 *  - RewardDayDoc, если документ есть;
 *  - null, если документа нет.
 */
export async function fetchTodayReward(
  uid: string
): Promise<RewardDayDoc | null> {
  const key = todayKey();
  const snap = await getDoc(doc(db, "rewards", uid, "days", key));
  if (!snap.exists()) return null;
  return snap.data() as RewardDayDoc;
}
