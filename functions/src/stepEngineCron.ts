// functions/src/stepEngineCron.ts
// ------------------------------------------------------
// Step Engine V2 — ежедневный cron для расчёта наград за шаги.
// Считает "вчера" (UTC), использует ядро V2 (stepEngineV2.ts).
//
// ВАЖНО: это новый движок V2. Старый runDailyDryRun из
// step-engine.ts не трогаем, он может жить параллельно.
// ------------------------------------------------------

import { DateTime } from "luxon";
import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { randomUUID } from "crypto";

import {
  SubscriptionTier,
  StepEngineDayInput,
  StepEngineDayResult,
} from "./types.js";

import { computeStepEngineDayResult } from "./steps/stepEngineV2.js";

const MIN_STEPS = 1000;

/* ========================================================================
 * Локальная копия токеномики для cron (чтобы не тянуть TS-файл из mobile)
 * ======================================================================*/

/**
 * Сколько GAD разблокируется каждые 6 месяцев для пула шагов.
 * В ТЗ: 500B GAD на период 180 дней.
 */
const SIX_MONTH_STEPS_POOL_GAD = 500_000_000_000;

/**
 * Длительность одного периода разблокировок (в днях).
 */
const STEPS_POOL_PERIOD_DAYS = 180;

/**
 * Базовый дневной пул для шагов без учёта override.
 * По умолчанию: 500B / 180.
 */
const DEFAULT_DAILY_STEPS_POOL_GAD =
  SIX_MONTH_STEPS_POOL_GAD / STEPS_POOL_PERIOD_DAYS;

/**
 * Локальные override'ы дневного пула.
 * Можно конфигурировать под особые дни.
 */
const DAILY_POOL_OVERRIDES: Record<string, number> = {
  // Пример:
  // "2025-12-24": DEFAULT_DAILY_STEPS_POOL_GAD * 2,
};

/**
 * Коэффициенты по подписке.
 * Free  → 1.0
 * Plus  → 1.5
 * Pro   → 2.0
 */
const SUBSCRIPTION_MULTIPLIERS: Record<SubscriptionTier, number> = {
  free: 1.0,
  plus: 1.5,
  pro: 2.0,
};

/**
 * Получить дневной пул GAD Points для шагов на конкретную дату.
 */
function getDailyStepsPool(date: string): number {
  const override = DAILY_POOL_OVERRIDES[date];
  if (typeof override === "number" && override > 0) {
    return override;
  }
  return DEFAULT_DAILY_STEPS_POOL_GAD;
}

/**
 * Получить мультипликатор по подписке.
 */
function getSubscriptionMultiplier(tier: SubscriptionTier): number {
  const m = SUBSCRIPTION_MULTIPLIERS[tier];
  if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) {
    return SUBSCRIPTION_MULTIPLIERS.free;
  }
  return m;
}

/**
 * Рассчитать "взвешенные шаги" (weightedSteps) для пользователя.
 *
 * Формула:
 *   weightedSteps = steps * multiplier
 *
 * Возраст здесь не режем — логика 100% в семью для детей
 * реализуется позже при раздельном family/personal split.
 */
function computeWeightedSteps(
  steps: number,
  tier: SubscriptionTier,
  age: number | null
): number {
  if (!Number.isFinite(steps) || steps <= 0) {
    return 0;
  }

  const multiplier = getSubscriptionMultiplier(tier);

  const weighted = steps * multiplier;

  if (!Number.isFinite(weighted) || weighted <= 0) {
    return 0;
  }

  return weighted;
}

/**
 * Рассчитать дневной коэффициент rateDay:
 *   rateDay = dailyPool / totalWeightedSteps
 */
function computeRateDay(
  dailyPool: number,
  totalWeightedSteps: number
): number {
  if (
    !Number.isFinite(dailyPool) ||
    dailyPool <= 0 ||
    !Number.isFinite(totalWeightedSteps) ||
    totalWeightedSteps <= 0
  ) {
    return 0;
  }

  const rate = dailyPool / totalWeightedSteps;

  if (!Number.isFinite(rate) || rate <= 0) {
    return 0;
  }

  return rate;
}

// тип для aggregated stats
type DailyStats = {
  date: string;
  runId: string;
  status: "ok" | "no_rewards";
  totalUsersScanned: number;
  totalUsersEligible: number;
  totalUsersRewarded: number;
  totalSteps: number;
  totalWeightedSteps: number;
  totalPointsDistributed: number;
  rateDay: number;
  executedAt: FirebaseFirestore.FieldValue;
};

/**
 * Вспомогательная функция: получить "вчера" в UTC в формате YYYY-MM-DD.
 */
function getYesterdayUtc(): string {
  return DateTime.utc().minus({ days: 1 }).toFormat("yyyy-LL-dd");
}

/**
 * Вынесенная логика обработки ОДНОГО пользователя:
 * - считает результат через computeStepEngineDayResult;
 * - проверяет идемпотентность по runId;
 * - делит gadEarned на family / personal;
 * - пишет:
 *    - rewards/{uid}/days/{date}
 *    - balances/{uid}
 *    - families/{fid}/treasury/ledger/{entryId}
 *    - aggregated rewards/{uid}
 *
 * Пишет в переданный batch, НО сам не коммитит его.
 *
 * Возвращает:
 *  - result: StepEngineDayResult
 *  - gad: число GAD, начисленное пользователю
 *  - rewarded: были ли реальные награды (gad > 0 и не продублирован runId)
 *  - writes: сколько операций batch было добавлено
 */
export async function runStepEngineV2ForUser(
  db: FirebaseFirestore.Firestore,
  input: StepEngineDayInput,
  rateDay: number,
  runId: string,
  batch: FirebaseFirestore.WriteBatch
): Promise<{
  result: StepEngineDayResult;
  gad: number;
  rewarded: boolean;
  writes: number;
}> {
  const date = input.date;
  const uid = input.uid;

  const result = computeStepEngineDayResult(input, rateDay);

  const gad = parseFloat(result.gadEarned || "0");
  if (!Number.isFinite(gad) || gad <= 0) {
    return { result, gad: 0, rewarded: false, writes: 0 };
  }

  // Идемпотентность по runId
  const rewardRef = db.doc(`rewards/${uid}/days/${date}`);
  const existingSnap = await rewardRef.get();
  const existingRunId = existingSnap.get("runId") as string | undefined;

  if (existingRunId && existingRunId === runId) {
    // уже считали этим же runId — ничего не делаем
    return { result, gad: 0, rewarded: false, writes: 0 };
  }

  // Деление gad на family / personal (та же логика, что и на фронте)
  const ageYears = input.ageYears ?? null;
  const familyId = input.familyId ?? null;

  let familyShare = 0;
  let personalShare = 0;

  if (ageYears != null && ageYears < 14) {
    // дети < 14 → 100% в семью (treasury / child-locked)
    familyShare = gad;
    personalShare = 0;
  } else {
    if (familyId) {
      // взрослый и есть семья → 80/20
      familyShare = gad * 0.8;
      personalShare = gad * 0.2;
    } else {
      // взрослый без семьи → всё на личный баланс
      familyShare = 0;
      personalShare = gad;
    }
  }

  // Округление до 6 знаков для хранения
  const toFixed6 = (n: number) => Number(n.toFixed(6));
  const gadFixed = toFixed6(gad);
  familyShare = toFixed6(familyShare);
  personalShare = toFixed6(personalShare);

  let writes = 0;

  // 1) rewards/{uid}/days/{date}
  batch.set(
    rewardRef,
    {
      ...result,
      gadEarned: gadFixed.toFixed(6),
      gadPreview: result.gadPreview ?? gadFixed.toFixed(6),
      familyShare,
      personalShare,
      runId,
      createdAt:
        existingSnap.get("createdAt") ??
        admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  writes++;

  // 2) balances/{uid}
  const balRef = db.doc(`balances/${uid}`);
  batch.set(
    balRef,
    {
      personal: admin.firestore.FieldValue.increment(personalShare),
      family: admin.firestore.FieldValue.increment(familyShare),
      totalEarned: admin.firestore.FieldValue.increment(gadFixed),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  writes++;

  // 3) families/{fid}/treasury/ledger/{entryId}
  if (familyId && familyShare > 0) {
    const entryId = `${date}_${uid}_${runId}`;
    const ledgerRef = db.doc(
      `families/${familyId}/treasury/ledger/${entryId}`
    );
    batch.set(
      ledgerRef,
      {
        type: "steps_reward",
        date,
        amount: familyShare,
        fromUser: uid,
        runId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    writes++;
  }

  // 4) aggregated user rewards: rewards/{uid}
  const aggRef = db.doc(`rewards/${uid}`);
  batch.set(
    aggRef,
    {
      uid,
      lastDate: date,
      lastStatus: result.status,
      lastGadEarned: gadFixed.toFixed(6),
      lastTotalSteps: result.totalSteps,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  writes++;

  return {
    result,
    gad: gadFixed,
    rewarded: true,
    writes,
  };
}

/**
 * Основная функция: расчёт на указанную дату.
 * Можно дергать вручную из тестов, а cron просто вызывает её без аргумента.
 */
export async function runStepEngineForDate(
  targetDate?: string
): Promise<DailyStats> {
  const db = admin.firestore();

  const date = targetDate || getYesterdayUtc();
  const runId = randomUUID();

  logger.info("[StepEngineV2] Starting run", { date, runId });

  // 1) Загружаем всех пользователей
  const usersSnap = await db.collection("users").get();
  const userDocs = usersSnap.docs;

  const inputs: StepEngineDayInput[] = [];

  let totalSteps = 0;
  let totalUsersScanned = 0;
  let totalUsersEligible = 0;
  let totalWeightedSteps = 0;

  // 2) Собираем контекст по каждому пользователю + шаги за день
  for (const userDoc of userDocs) {
    totalUsersScanned++;

    const uid = userDoc.id;
    const profile = (userDoc.data() || {}) as any;

    const status = (profile.status as string | undefined) ?? "active";
    if (status !== "active") {
      continue;
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

    // dailySteps/{uid}/days/{date}
    const stepsRef = db.doc(`dailySteps/${uid}/days/${date}`);
    const stepsSnap = await stepsRef.get();
    const rawSteps = Number(stepsSnap.get("steps") || 0);
    const steps = Number.isFinite(rawSteps) && rawSteps > 0 ? rawSteps : 0;

    if (steps <= 0) {
      continue;
    }

    totalSteps += steps;

    // Фильтр MIN_STEPS на этом уровне (кто ниже порога — не участвует в пуле)
    if (steps < MIN_STEPS) {
      continue;
    }

    totalUsersEligible++;

    const input: StepEngineDayInput = {
      uid,
      date,
      timezone: "Etc/UTC",
      familyId,
      ageYears,
      subscriptionTier,
      totalSteps: steps,
      dailyStepsDocPath: stepsRef.path,
      periods: undefined,
    };

    inputs.push(input);

    // Для rateDay считаем общий totalWeightedSteps
    const w = computeWeightedSteps(steps, subscriptionTier, ageYears ?? null);
    if (w > 0) {
      totalWeightedSteps += w;
    }
  }

  const statsRef = db.doc(`dailyStats/${date}`);

  // Если вообще нет контекстов → сразу пишем "no_rewards"
  if (!inputs.length || totalWeightedSteps <= 0) {
    const stats: DailyStats = {
      date,
      runId,
      status: "no_rewards",
      totalUsersScanned,
      totalUsersEligible,
      totalUsersRewarded: 0,
      totalSteps,
      totalWeightedSteps: Math.max(totalWeightedSteps, 0),
      totalPointsDistributed: 0,
      rateDay: 0,
      executedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await statsRef.set(stats, { merge: true });

    logger.info("[StepEngineV2] No eligible contexts for date", {
      date,
      runId,
      totalUsersScanned,
      totalUsersEligible,
      totalSteps,
      totalWeightedSteps,
    });

    return stats;
  }

  // 3) Получаем дневной пул и rateDay
  const dailyPool = getDailyStepsPool(date);
  const rateDay = computeRateDay(dailyPool, totalWeightedSteps);

  logger.info("[StepEngineV2] Pools and rateDay", {
    date,
    runId,
    dailyPool,
    totalWeightedSteps,
    rateDay,
  });

  // 4) Обрабатываем каждого пользователя через runStepEngineV2ForUser, используя batch
  const dbRef = admin.firestore();
  let batch = dbRef.batch();
  let writesInBatch = 0;
  const batchCommits: Promise<FirebaseFirestore.WriteResult[]>[] = [];

  const enqueueCommitIfNeeded = () => {
    // Firestore ограничение ~500 операций на батч → держимся до ~400
    if (writesInBatch >= 400) {
      batchCommits.push(batch.commit());
      batch = dbRef.batch();
      writesInBatch = 0;
    }
  };

  let totalPointsDistributed = 0;
  let totalUsersRewarded = 0;

  for (const input of inputs) {
    const { gad, rewarded, writes } = await runStepEngineV2ForUser(
      dbRef,
      input,
      rateDay,
      runId,
      batch
    );

    if (rewarded) {
      totalUsersRewarded++;
      totalPointsDistributed += gad;
    }

    writesInBatch += writes;
    enqueueCommitIfNeeded();
  }

  // 5) Записываем aggregated stats
  const stats: DailyStats = {
    date,
    runId,
    status: totalUsersRewarded > 0 ? "ok" : "no_rewards",
    totalUsersScanned,
    totalUsersEligible,
    totalUsersRewarded,
    totalSteps,
    totalWeightedSteps,
    totalPointsDistributed,
    rateDay,
    executedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  batch.set(statsRef, stats, { merge: true });
  writesInBatch++;

  // 6) Коммитим все батчи
  if (writesInBatch > 0) {
    batchCommits.push(batch.commit());
  }

  await Promise.all(batchCommits);

  logger.info("[StepEngineV2] Finished run", {
    date,
    runId,
    totalUsersScanned,
    totalUsersEligible,
    totalUsersRewarded,
    totalSteps,
    totalWeightedSteps,
    totalPointsDistributed,
    rateDay,
  });

  return stats;
}

/**
 * Cron-функция: запускается каждый день в 00:05 UTC.
 */
export const stepEngineCron = onSchedule(
  {
    schedule: "5 0 * * *", // 00:05 UTC каждый день
    timeZone: "Etc/UTC",
  },
  async () => {
    try {
      await runStepEngineForDate();
    } catch (e) {
      logger.error("[StepEngineV2] Cron error", e as any);
      throw e;
    }
  }
);
