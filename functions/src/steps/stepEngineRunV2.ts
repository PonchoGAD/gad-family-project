// functions/src/steps/stepEngineRunV2.ts
// ------------------------------------------------------
// Step Engine V2 — per-user callable.
// Запускает расчёт награды за шаги для ОДНОГО пользователя и одной даты.
// Использует ядро V2 (computeStepEngineDayResult) и общий helper
// runStepEngineV2ForUser из stepEngineCron.ts.
// ------------------------------------------------------

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { DateTime } from "luxon";

import { US_REGIONS } from "../config.js";
import {
  SubscriptionTier,
  StepEngineDayInput,
  StepEngineDayResult,
} from "../types.js";

import { runStepEngineV2ForUser } from "../stepEngineCron.js";

// ✅ общий токеномикс теперь из shared-модуля внутри functions
import {
  getDailyStepsPool,
  computeWeightedSteps,
  computeRateDay,
} from "../tokenomicsShared.js";

/**
 * Получить "вчера" в указанном TZ (например, America/New_York) в формате YYYY-MM-DD.
 */
function getYesterdayInTz(tz: string): string {
  return DateTime.now().setZone(tz).minus({ days: 1 }).toFormat("yyyy-LL-dd");
}

export type StepEngineRunV2Response = {
  ok: boolean;
  date: string;
  gad?: number;
  result?: StepEngineDayResult;
  reason?: string;
};

export const stepEngineRunV2 = onCall<{ date?: string }>(
  {
    region: US_REGIONS,
    enforceAppCheck: true,
  },
  async (req): Promise<StepEngineRunV2Response> => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Auth required");
    }

    const { date } = (req.data || {}) as { date?: string };
    const tz = process.env.APP_TIMEZONE || "America/New_York";
    const dateISO = date || getYesterdayInTz(tz);

    const db = admin.firestore();

    // 1) users/{uid}
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User profile not found");
    }

    const profile = (userSnap.data() || {}) as any;
    const status = (profile.status as string | undefined) ?? "active";
    if (status !== "active") {
      throw new HttpsError("failed-precondition", "User is not active");
    }

    const ageYears =
      typeof profile.age === "number" && Number.isFinite(profile.age)
        ? (profile.age as number)
        : null;

    const tierRaw = (profile.subscriptionTier ||
      profile.subscription ||
      "free") as string;

    const subscriptionTier: SubscriptionTier =
      tierRaw === "plus" || tierRaw === "pro"
        ? (tierRaw as SubscriptionTier)
        : "free";

    const familyId =
      typeof profile.familyId === "string" && profile.familyId.length
        ? (profile.familyId as string)
        : null;

    // 2) dailySteps/{uid}/days/{date}
    const stepsRef = db.doc(`dailySteps/${uid}/days/${dateISO}`);
    const stepsSnap = await stepsRef.get();
    const rawSteps = Number(stepsSnap.get("steps") || 0);
    const steps = Number.isFinite(rawSteps) && rawSteps > 0 ? rawSteps : 0;

    if (steps <= 0) {
      return {
        ok: false,
        date: dateISO,
        reason: "no_steps",
      };
    }

    // 3) считаем свою локальную ставку rateDay для этого пользователя
    const weighted = computeWeightedSteps(
      steps,
      subscriptionTier,
      ageYears ?? null
    );
    if (!Number.isFinite(weighted) || weighted <= 0) {
      return {
        ok: false,
        date: dateISO,
        reason: "no_weight",
      };
    }

    const dailyPool = getDailyStepsPool(dateISO);
    const rateDay = computeRateDay(dailyPool, weighted);

    // 4) собираем input и запускаем runStepEngineV2ForUser
    const runId = `user-${uid}-${dateISO}`;

    const batch = db.batch();

    const input: StepEngineDayInput = {
      uid,
      date: dateISO,
      timezone: tz,
      familyId,
      ageYears,
      subscriptionTier,
      totalSteps: steps,
      dailyStepsDocPath: stepsRef.path,
      periods: undefined,
    };

    const { result, gad, rewarded } = await runStepEngineV2ForUser(
      db,
      input,
      rateDay,
      runId,
      batch
    );

    if (rewarded) {
      await batch.commit();
    }

    return {
      ok: rewarded,
      date: dateISO,
      gad,
      result,
    };
  }
);
