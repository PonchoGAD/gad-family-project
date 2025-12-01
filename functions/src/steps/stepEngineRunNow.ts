// functions/src/steps/stepEngineRunNow.ts
// ------------------------------------------------------
// Step Engine V2 — глобальный callable-dry-run для ОДНОЙ даты.
// Считает весь день по всем пользователям (через runStepEngineForDate).
// Используется как dev/admin-инструмент и с мобильного для "preview".
// ------------------------------------------------------

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { DateTime } from "luxon";

import { US_REGIONS } from "../config.js";
import { runStepEngineForDate } from "../stepEngineCron.js";

function getYesterdayUtc(): string {
  return DateTime.utc().minus({ days: 1 }).toFormat("yyyy-LL-dd");
}

export const stepEngineRunNow = onCall(
  {
    region: US_REGIONS,
    enforceAppCheck: true,
  },
  async (req) => {
    // Опционально можно потребовать admin-роль; пока разрешаем всем авторизованным
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Auth required");
    }

    const { date } = (req.data || {}) as { date?: string };
    const targetDate = date || getYesterdayUtc();

    const stats = await runStepEngineForDate(targetDate);

    return {
      ok: true,
      date: stats.date,
      processed: stats.totalUsersRewarded,
    } as {
      ok: boolean;
      date: string;
      processed: number;
    };
  }
);
