// functions/src/steps/stepEngineV2.ts
// ------------------------------------------------------
// Step Engine V2 — ядро для backend.
// Здесь нет Firebase-логики, только чистая математика:
//  - вход: StepEngineDayInput (uid, дата, возраст, подписка, шаги);
//  - выход: StepEngineDayResult (stepsCounted, gadPreview/gadEarned, статус, лимиты, бонусы).
//
// Cloud Functions сверху берут этот результат и уже пишут его в Firestore.
// ------------------------------------------------------

import {
  SubscriptionTier,
  StepEngineDayInput,
  StepEngineDayResult,
  StepEngineLimitInfo,
  StepEngineBonusFlags,
} from "../types.js";

// Общий вес / токеномикс считаем так же, как на фронте.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { computeWeightedSteps } from "../../apps/mobile/src/lib/tokenomics.js";

/**
 * Минимальное количество шагов, чтобы день участвовал в распределении.
 * Должно соответствовать фронту (MIN_STEPS в stepEngineTypes.ts).
 */
const MIN_STEPS = 1000;

/**
 * Лимиты шагов по подписке на один день.
 * Синхронизировано с MAX_STEPS на фронте (apps/mobile/src/lib/steps.ts).
 */
const DAILY_MAX_STEPS: Record<SubscriptionTier, number> = {
  free: 10000,
  plus: 15000,
  pro: 20000,
};

/**
 * Применяем лимиты к сырым шагам.
 * Возвращаем:
 *  - stepsCounted: сколько шагов учитываем в расчёте;
 *  - limit: описание лимитов/причины.
 */
function applyLimits(
  input: StepEngineDayInput
): { stepsCounted: number; limit: StepEngineLimitInfo } {
  const total = Number.isFinite(input.totalSteps) ? input.totalSteps : 0;
  const tier: SubscriptionTier = input.subscriptionTier || "free";
  const dailyCap = DAILY_MAX_STEPS[tier] ?? DAILY_MAX_STEPS.free;

  const safeTotal = total > 0 ? Math.floor(total) : 0;

  // Нет шагов вообще
  if (safeTotal <= 0) {
    return {
      stepsCounted: 0,
      limit: {
        dailyMaxSteps: dailyCap,
        applied: true,
        reason: "zero-steps",
        stepsBeforeCap: safeTotal,
        stepsAfterCap: 0,
      },
    };
  }

  // Обрезаем по максимально допустимому количеству
  const capped = Math.min(safeTotal, dailyCap);

  // Меньше минимального порога участия
  if (capped < MIN_STEPS) {
    return {
      stepsCounted: 0,
      limit: {
        dailyMaxSteps: dailyCap,
        applied: true,
        reason: "under-min-steps",
        stepsBeforeCap: safeTotal,
        stepsAfterCap: capped,
      },
    };
  }

  // Есть реальный cap
  if (capped < safeTotal) {
    return {
      stepsCounted: capped,
      limit: {
        dailyMaxSteps: dailyCap,
        applied: true,
        reason: "cap",
        stepsBeforeCap: safeTotal,
        stepsAfterCap: capped,
      },
    };
  }

  // Никаких ограничений
  return {
    stepsCounted: capped,
    limit: {
      dailyMaxSteps: dailyCap,
      applied: false,
      reason: "none",
      stepsBeforeCap: safeTotal,
      stepsAfterCap: capped,
    },
  };
}

/**
 * Вспомогательная функция — флаги бонусов.
 * Здесь пока только базовый флаг по подписке.
 * Остальные (zone/streak/missions) будут добавляться в V2.1+.
 */
function buildBonusFlags(
  input: StepEngineDayInput,
  weightedSteps: number
): StepEngineBonusFlags {
  const flags: StepEngineBonusFlags = {};

  if (input.subscriptionTier === "plus" || input.subscriptionTier === "pro") {
    flags.subscriptionBoostApplied = weightedSteps > 0;
  }

  // TODO(V2.1): flags.zoneBonusApplied = ... (safe-зоны)
  // TODO(V2.1): flags.streakBonusApplied = ... (стрики/серии дней)

  return flags;
}

/**
 * Основная функция ядра Step Engine V2.
 *
 * @param input  контекст дня: пользователь, дата, подписка, возраст, шаги
 * @param rateDay дневная ставка: сколько GAD Points за 1 weightedStep
 */
export function computeStepEngineDayResult(
  input: StepEngineDayInput,
  rateDay: number
): StepEngineDayResult {
  const safeRate = Number.isFinite(rateDay) && rateDay > 0 ? rateDay : 0;

  const { stepsCounted, limit } = applyLimits(input);

  // TODO(V2.1): read locations/{uid}/history/{date}/points/*
  // TODO(V2.1): compute zoneBonusSteps / zoneBonusGad based on safe zones
  // TODO(V2.1): fill missionsCompleted with mission IDs ("home_school", "school_home", ...)

  // Пока гео-бонусы не считаются, просто держим нули/пустой массив.
  const baseZoneBonusSteps = 0;
  const baseZoneBonusGad = "0";
  const baseMissionsCompleted: string[] = [];

  // Если нет шагов или ставка 0 — день фактически пропущен.
  if (stepsCounted <= 0 || safeRate === 0) {
    return {
      uid: input.uid,
      date: input.date,
      familyId: input.familyId,
      subscriptionTier: input.subscriptionTier,
      totalSteps: input.totalSteps || 0,
      stepsCounted: 0,
      gadPreview: "0",
      gadEarned: "0",
      status: "skipped",
      limit,
      bonusFlags: {},
      zoneBonusSteps: baseZoneBonusSteps,
      zoneBonusGad: baseZoneBonusGad,
      missionsCompleted: baseMissionsCompleted,
      meta: {
        dryRun: false,
      },
    };
  }

  // Взвешенные шаги учитывают подписку и возраст.
  const weightedSteps = computeWeightedSteps(
    stepsCounted,
    input.subscriptionTier,
    input.ageYears ?? null
  );

  // Если после взвешивания ничего не осталось — тоже "пропуск".
  if (!Number.isFinite(weightedSteps) || weightedSteps <= 0) {
    return {
      uid: input.uid,
      date: input.date,
      familyId: input.familyId,
      subscriptionTier: input.subscriptionTier,
      totalSteps: input.totalSteps || 0,
      stepsCounted,
      gadPreview: "0",
      gadEarned: "0",
      status: "skipped",
      limit,
      bonusFlags: {},
      zoneBonusSteps: baseZoneBonusSteps,
      zoneBonusGad: baseZoneBonusGad,
      missionsCompleted: baseMissionsCompleted,
      meta: {
        dryRun: false,
      },
    };
  }

  // Базовая награда
  const rawPoints = weightedSteps * safeRate;
  const points = Number.isFinite(rawPoints) && rawPoints > 0 ? rawPoints : 0;

  const toFixed6 = (n: number) => n.toFixed(6);

  const gadPreview = toFixed6(points);
  const gadEarned = toFixed6(points); // пока preview == earned, но можно будет разделить

  const status: StepEngineDayResult["status"] =
    limit.applied && limit.reason === "cap" ? "limit" : "ok";

  const bonusFlags = buildBonusFlags(input, weightedSteps);

  return {
    uid: input.uid,
    date: input.date,
    familyId: input.familyId,
    subscriptionTier: input.subscriptionTier,

    totalSteps: input.totalSteps || 0,
    stepsCounted,

    gadPreview,
    gadEarned,

    status,
    limit,
    bonusFlags,

    zoneBonusSteps: baseZoneBonusSteps,
    zoneBonusGad: baseZoneBonusGad,
    missionsCompleted: baseMissionsCompleted,

    meta: {
      dryRun: false,
    },
  };
}
