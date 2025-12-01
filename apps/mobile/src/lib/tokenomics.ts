// apps/mobile/src/lib/tokenomics.ts
// ------------------------------------------------------
// Tokenomics math for Step Engine V2 (pure, side-effect free)
//
// Здесь НЕТ Firebase / React / Expo — только числа и формулы.
// Этот модуль можно безопасно использовать:
//  - в мобильном приложении (UI, симуляции),
//  - в Cloud Functions (stepEngineCron), если вынести в shared-пакет.
// ------------------------------------------------------

import { SubscriptionTier, CHILD_AGE_LIMIT } from "./stepEngineTypes";

/**
 * Сколько GAD разблокируется каждые 6 месяцев
 * для пула шагов.
 *
 * В ТЗ: 500B GAD на период 180 дней.
 */
export const SIX_MONTH_STEPS_POOL_GAD = 500_000_000_000;

/**
 * Длительность одного периода разблокировок (в днях).
 */
export const STEPS_POOL_PERIOD_DAYS = 180;

/**
 * Базовый дневной пул для шагов без учёта override.
 * По умолчанию: 500B / 180.
 */
export const DEFAULT_DAILY_STEPS_POOL_GAD =
  SIX_MONTH_STEPS_POOL_GAD / STEPS_POOL_PERIOD_DAYS;

/**
 * Локальные override'ы дневного пула.
 *
 * Ключ: date в формате 'YYYY-MM-DD' (UTC).
 * Значение: пул GAD Points на шаги в этот день.
 *
 * В реальной проде это может приходить из:
 *  - Firestore: config/dailyPools/{date}.stepsPool,
 *  - Remote Config,
 *  - или другого конфига.
 *
 * Здесь оставляем как простой объект, чтобы:
 *  - иметь единую точку входа getDailyStepsPool(),
 *  - можно было легко тестировать/симулировать особые дни.
 */
const DAILY_POOL_OVERRIDES: Record<string, number> = {
  // Пример:
  // "2025-12-24": DEFAULT_DAILY_STEPS_POOL_GAD * 2, // x2 pool на Рождество
};

/**
 * Коэффициенты по подписке.
 *
 * Free  → 1.0
 * Plus  → 1.5
 * Pro   → 2.0
 */
export const SUBSCRIPTION_MULTIPLIERS: Record<SubscriptionTier, number> = {
  free: 1.0,
  plus: 1.5,
  pro: 2.0,
};

// ------------------------------------------------------
// Public API
// ------------------------------------------------------

/**
 * Получить дневной пул GAD Points для шагов
 * на конкретную дату.
 *
 * @param date Дата формата 'YYYY-MM-DD' (UTC).
 */
export function getDailyStepsPool(date: string): number {
  // Если на конкретный день есть override → берём его.
  const override = DAILY_POOL_OVERRIDES[date];
  if (typeof override === "number" && override > 0) {
    return override;
  }

  // Иначе используем базовый пул (500B / 180).
  return DEFAULT_DAILY_STEPS_POOL_GAD;
}

/**
 * Получить мультипликатор по подписке.
 *
 * @param tier Подписка пользователя ('free' | 'plus' | 'pro').
 */
export function getSubscriptionMultiplier(tier: SubscriptionTier): number {
  const m = SUBSCRIPTION_MULTIPLIERS[tier];
  // На всякий случай защищаемся от некорректных значений.
  if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) {
    return SUBSCRIPTION_MULTIPLIERS.free;
  }
  return m;
}

/**
 * Рассчитать "взвешенные шаги" (weightedSteps) для пользователя.
 *
 * Формула:
 *  weightedSteps = steps * multiplier
 *
 * Где:
 *  - steps       → сырые шаги из dailySteps/{uid}/days/{date};
 *  - multiplier  → зависит от подписки (free/plus/pro).
 *
 * ВАЖНО:
 *  Возрастные правила для детей (<14) мы здесь НЕ режем,
 *  согласно ТЗ:
 *    «дети <14 — можно оставить как есть, но награды идут
 *     в family vault / child-locked».
 *
 * То есть:
 *  - ребёнок с Plus всё равно получает повышенный multiplier,
 *    но его personalShare потом будет 0, а всё уйдёт в семью.
 *
 * @param steps Количество шагов за день.
 * @param tier Подписка ('free' | 'plus' | 'pro').
 * @param age Возраст пользователя (или null, если неизвестен).
 */
export function computeWeightedSteps(
  steps: number,
  tier: SubscriptionTier,
  age: number | null
): number {
  if (!Number.isFinite(steps) || steps <= 0) {
    return 0;
  }

  const multiplier = getSubscriptionMultiplier(tier);

  // При необходимости можно добавить дополнительные ограничения
  // по возрасту, например:
  //
  // if (age !== null && age < CHILD_AGE_LIMIT) {
  //   // Здесь могли бы уменьшать multiplier для детей,
  //   // но по текущему ТЗ оставляем его как есть.
  // }
  //
  // Сейчас возраст используется только на уровне распределения
  // (100% в семью), а не на уровне weightedSteps.

  const weighted = steps * multiplier;

  // Защита от NaN / Infinity
  if (!Number.isFinite(weighted) || weighted <= 0) {
    return 0;
  }

  return weighted;
}

/**
 * Рассчитать дневной коэффициент rateDay:
 *
 *   rateDay = dailyPool / totalWeightedSteps
 *
 * Где:
 *  - dailyPool          → результат getDailyStepsPool(date),
 *  - totalWeightedSteps → сумма weightedSteps всех пользователей.
 *
 * Если totalWeightedSteps <= 0 → возвращаем 0.
 *
 * @param dailyPool Дневной пул GAD Points для шагов.
 * @param totalWeightedSteps Суммарные "взвешенные шаги" за день по всем пользователям.
 */
export function computeRateDay(
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
