// apps/mobile/src/lib/stepEngine.ts 
// ------------------------------------------------------
// Step Engine V2 — ядро + клиентские хелперы.
//
// Часть 1: чистая бизнес-логика без Firebase:
//  - считаем дневную награду одного пользователя;
//  - делим на family/personal (80/20, дети 100% в семью);
//  - строим описания операций записи в Firestore (RewardWriteOps).
//
// Часть 2: клиентские хелперы поверх Firestore:
//  - fetchTodayReward / subscribeTodayReward;
//  - getTodayStepsPreview (dailySteps + rewards).
// ------------------------------------------------------

import {
  CHILD_AGE_LIMIT,
  MIN_STEPS,
  SubscriptionTier,
  UserDayContext,
  UserDayReward,
  RewardWriteOps,
  StepEngineDayResult,
  RewardDayDoc,
} from "./stepEngineTypes";
import { computeWeightedSteps } from "./tokenomics";

// Клиентская часть (Firestore)
import { db } from "../firebase";
import { doc, getDoc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { todayKey } from "./steps";

/* ========================================================================
 * ЧАСТЬ 1. ЧИСТАЯ МАТЕМАТИКА / БИЗНЕС-ЛОГИКА (без Firebase)
 * ======================================================================*/

/**
 * Вспомогательная проверка: ребёнок ли по возрасту.
 */
export function isChild(age: number | null): boolean {
  if (age === null || !Number.isFinite(age)) return false;
  return age < CHILD_AGE_LIMIT;
}

/**
 * Основная функция расчёта награды за день для одного пользователя.
 *
 * Вход:
 *  - контекст пользователя (uid, familyId, age, tier, steps, date);
 *  - дневная ставка rateDay (points per 1 weighted step).
 *
 * Выход:
 *  - UserDayReward с рассчитанными полями.
 *
 * Логика:
 *  - если steps < MIN_STEPS или rateDay <= 0 → points = 0;
 *  - считаем weightedSteps = steps * multiplier;
 *  - points = weightedSteps * rateDay;
 *  - если ребёнок (<14) → 100% в семью;
 *  - если взрослый (>=14):
 *      - если есть familyId → 80% family / 20% personal;
 *      - если нет familyId → 100% personal.
 */
export function computeUserDayReward(
  ctx: UserDayContext,
  rateDay: number
): UserDayReward {
  const { uid, date, familyId, age, subscriptionTier, steps } = ctx;

  // Базовая валидация входных данных.
  const safeSteps =
    Number.isFinite(steps) && steps > 0 ? Math.floor(steps) : 0;
  const safeRate = Number.isFinite(rateDay) && rateDay > 0 ? rateDay : 0;

  // Если не прошли минимальный порог или ставка = 0 → день "пропущен".
  if (safeSteps < MIN_STEPS || safeRate === 0) {
    return {
      uid,
      date,
      familyId,
      steps: safeSteps,
      weightedSteps: 0,
      subscriptionTier,
      rateDay: safeRate,
      points: 0,
      familyShare: 0,
      personalShare: 0,
    };
  }

  // Считаем взвешенные шаги с учётом подписки.
  const weightedSteps = computeWeightedSteps(safeSteps, subscriptionTier, age);

  if (weightedSteps <= 0) {
    return {
      uid,
      date,
      familyId,
      steps: safeSteps,
      weightedSteps: 0,
      subscriptionTier,
      rateDay: safeRate,
      points: 0,
      familyShare: 0,
      personalShare: 0,
    };
  }

  // Общие GAD Points за день.
  const rawPoints = weightedSteps * safeRate;

  // Защита от NaN / Infinity.
  const safePoints =
    Number.isFinite(rawPoints) && rawPoints > 0 ? rawPoints : 0;

  if (safePoints === 0) {
    return {
      uid,
      date,
      familyId,
      steps: safeSteps,
      weightedSteps,
      subscriptionTier,
      rateDay: safeRate,
      points: 0,
      familyShare: 0,
      personalShare: 0,
    };
  }

  // Деление на семью / личное.
  const child = isChild(age);

  let familyShare = 0;
  let personalShare = 0;

  if (child) {
    // Дети <14 → 100% в семью (или child-locked).
    familyShare = safePoints;
    personalShare = 0;
  } else {
    if (familyId) {
      // Взрослый и есть семья → 80/20
      familyShare = safePoints * 0.8;
      personalShare = safePoints * 0.2;
    } else {
      // Взрослый, но без семьи → всё в личный баланс.
      familyShare = 0;
      personalShare = safePoints;
    }
  }

  // Округление до 4 знаков после запятой.
  const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

  return {
    uid,
    date,
    familyId,
    steps: safeSteps,
    weightedSteps: round4(weightedSteps),
    subscriptionTier,
    rateDay: safeRate,
    points: round4(safePoints),
    familyShare: round4(familyShare),
    personalShare: round4(personalShare),
  };
}

/**
 * Построение "плана записи" в Firestore
 * для одного уже посчитанного UserDayReward.
 *
 * Здесь мы НЕ используем admin.firestore.FieldValue — только
 * описываем, что нужно сделать:
 *
 *  - rewards/{uid}/days/{date} = полный срез дня;
 *  - balances/{uid} += shares;
 *  - families/{fid}/treasury/ledger/{entryId} = запись в сейф (если familyShare > 0).
 *
 * @param reward результат computeUserDayReward
 * @param runId уникальный id запуска движка (для идемпотентности)
 */
export function buildRewardWriteOps(
  reward: UserDayReward,
  runId: string
): RewardWriteOps {
  const {
    uid,
    date,
    familyId,
    steps,
    weightedSteps,
    subscriptionTier,
    rateDay,
    points,
    familyShare,
    personalShare,
  } = reward;

  const status: "paid" | "skipped" = points > 0 ? "paid" : "skipped";

  // ----------------------------
  // rewards/{uid}/days/{date}
  // ----------------------------
  const rewardDoc: RewardWriteOps["rewardDoc"] = {
    path: `rewards/${uid}/days/${date}`,
    data: {
      date,
      uid,
      steps,
      weightedSteps,
      subscriptionTier,
      rateDay,
      points,
      familyShare,
      personalShare,
      status,
      runId,
      // updatedAt: ставим в Cloud Function через serverTimestamp
    },
  };

  // ----------------------------
  // balances/{uid}
  // ----------------------------
  let balanceDoc: RewardWriteOps["balanceDoc"] = null;

  if (points > 0) {
    balanceDoc = {
      path: `balances/${uid}`,
      increments: {
        personal: personalShare,
        family: familyShare,
        totalEarned: points,
      },
    };
  }

  // ----------------------------
  // families/{fid}/treasury/ledger/{entryId}
  // ----------------------------
  let familyLedgerDoc: RewardWriteOps["familyLedgerDoc"] = null;

  if (familyId && familyShare > 0) {
    const entryId = `${date}_${uid}_${runId}`;

    familyLedgerDoc = {
      path: `families/${familyId}/treasury/ledger/${entryId}`,
      data: {
        type: "steps_reward" as const,
        date,
        amount: familyShare,
        fromUser: uid,
        runId,
        // createdAt: ставится в Cloud Function (serverTimestamp)
      },
    };
  }

  return {
    rewardDoc,
    balanceDoc,
    familyLedgerDoc,
  };
}

/* ========================================================================
 * ЧАСТЬ 2. КЛИЕНТСКИЕ V2-ХЕЛПЕРЫ (Firestore + StepEngineDayResult)
 * ======================================================================*/

/**
 * Приведение Firestore-документа к StepEngineDayResult
 * с безопасными дефолтами.
 */
function mapRewardDocToDayResult(
  raw: RewardDayDoc,
  fallbackId?: string
): StepEngineDayResult {
  const date = typeof raw.date === "string" ? raw.date : fallbackId || "";

  const safeString = (v: unknown, def = "0"): string => {
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v.toString();
    return def;
  };

  // legacy-совместимость: старые поля могут быть в документе, но не в типе
  const legacy = raw as any;

  return {
    uid: raw.uid,
    date,
    familyId: raw.familyId ?? null,
    subscriptionTier: (raw.subscriptionTier ??
      legacy.subscription ??
      "free") as SubscriptionTier,

    totalSteps: Number(
      raw.totalSteps ?? raw.stepsCounted ?? legacy.steps ?? 0
    ),
    stepsCounted: Number(
      raw.stepsCounted ?? raw.totalSteps ?? legacy.steps ?? 0
    ),

    gadPreview: safeString(raw.gadPreview ?? legacy.points),
    gadEarned: safeString(
      raw.gadEarned ?? raw.gadPreview ?? legacy.points
    ),

    status: (raw.status as StepEngineDayResult["status"]) ?? "skipped",
    limit:
      raw.limit ?? {
        applied: false,
        reason: "none",
        dailyMaxSteps: 0,
        stepsBeforeCap: 0,
        stepsAfterCap: 0,
      },
    bonusFlags: raw.bonusFlags ?? {},

    zoneBonusSteps: Number(raw.zoneBonusSteps ?? 0),
    zoneBonusGad: safeString(raw.zoneBonusGad ?? "0"),

    missionsCompleted: Array.isArray(raw.missionsCompleted)
      ? raw.missionsCompleted
      : [],

    meta: raw.meta ?? { dryRun: false },
  };
}

/**
 * Прочитать дневной reward за ПРОИЗВОЛЬНУЮ дату для uid.
 * Дата — это ключ документа (например, "2025-12-01").
 */
export async function fetchRewardForDate(
  uid: string,
  dateKey: string
): Promise<StepEngineDayResult | null> {
  if (!uid || !dateKey) return null;

  const ref = doc(db, "rewards", uid, "days", dateKey);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const data = snap.data() as RewardDayDoc;
  return mapRewardDocToDayResult(data, snap.id);
}

/**
 * Прочитать дневной reward за сегодняшнюю дату для uid.
 * Никакого авто-запуска движка — просто чтение из Firestore.
 */
export async function fetchTodayReward(
  uid: string
): Promise<StepEngineDayResult | null> {
  if (!uid) return null;

  const key = todayKey();
  const ref = doc(db, "rewards", uid, "days", key);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const data = snap.data() as RewardDayDoc;
  return mapRewardDocToDayResult(data, snap.id);
}

/**
 * Подписка на дневной reward за сегодняшнюю дату.
 * Возвращает функцию отписки.
 */
export function subscribeTodayReward(
  uid: string,
  cb: (data: StepEngineDayResult | null) => void
): Unsubscribe {
  if (!uid) {
    cb(null);
    return () => {};
  }

  const key = todayKey();
  const ref = doc(db, "rewards", uid, "days", key);

  const unsub = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const data = snap.data() as RewardDayDoc;
      cb(mapRewardDocToDayResult(data, snap.id));
    },
    (_err) => {
      // В случае ошибки не роняем UI, просто отправляем null
      cb(null);
    }
  );

  return unsub;
}

/**
 * Прочитать "превью" сегодняшнего дня:
 *  - steps из dailySteps/{uid}/days/{today};
 *  - reward из rewards/{uid}/days/{today}.
 */
export async function getTodayStepsPreview(
  uid: string
): Promise<{ steps: number; reward: StepEngineDayResult | null }> {
  if (!uid) {
    return { steps: 0, reward: null };
  }

  const key = todayKey();

  // dailySteps/{uid}/days/{date}
  const stepsRef = doc(db, "dailySteps", uid, "days", key);
  const stepsSnap = await getDoc(stepsRef);

  const sData = (stepsSnap.exists() ? stepsSnap.data() : {}) as any;
  const steps = Number(sData.steps ?? sData.totalSteps ?? 0) || 0;

  const reward = await fetchTodayReward(uid);

  return { steps, reward };
}
