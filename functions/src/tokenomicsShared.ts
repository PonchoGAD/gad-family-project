// functions/src/tokenomicsShared.ts
// ------------------------------------------------------
// Tokenomics math for Step Engine V2 (backend-safe copy)
// ------------------------------------------------------

export type SubscriptionTier = "free" | "plus" | "pro";

export const CHILD_AGE_LIMIT = 14;

/**
 * 500B GAD unlock every 180 days
 */
export const SIX_MONTH_STEPS_POOL_GAD = 500_000_000_000;

export const STEPS_POOL_PERIOD_DAYS = 180;

export const DEFAULT_DAILY_STEPS_POOL_GAD =
  SIX_MONTH_STEPS_POOL_GAD / STEPS_POOL_PERIOD_DAYS;

/**
 * Optional overrides per date: { "2025-12-24": poolValue }
 */
const DAILY_POOL_OVERRIDES: Record<string, number> = {};

/**
 * Subscription multipliers
 */
export const SUBSCRIPTION_MULTIPLIERS: Record<SubscriptionTier, number> = {
  free: 1.0,
  plus: 1.5,
  pro: 2.0,
};

/**
 * Get daily pool for date
 */
export function getDailyStepsPool(date: string): number {
  const override = DAILY_POOL_OVERRIDES[date];
  if (typeof override === "number" && override > 0) {
    return override;
  }
  return DEFAULT_DAILY_STEPS_POOL_GAD;
}

/**
 * Get multiplier per tier
 */
export function getSubscriptionMultiplier(
  tier: SubscriptionTier
): number {
  const m = SUBSCRIPTION_MULTIPLIERS[tier];
  if (!Number.isFinite(m) || m <= 0) return SUBSCRIPTION_MULTIPLIERS.free;
  return m;
}

/**
 * Compute weighted steps
 */
export function computeWeightedSteps(
  steps: number,
  tier: SubscriptionTier,
  age: number | null
): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;

  const multiplier = getSubscriptionMultiplier(tier);
  const weighted = steps * multiplier;

  if (!Number.isFinite(weighted) || weighted <= 0) return 0;
  return weighted;
}

/**
 * Compute daily rate
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
  if (!Number.isFinite(rate) || rate <= 0) return 0;

  return rate;
}
