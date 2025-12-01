// ---------------------------------------------------------------
// apps/mobile/src/lib/steps.ts
// Общая логика для шагов и отображения Move-to-Earn
//  - формат ключей дат (YYYY-MM-DD)
//  - типы дневных шагов
//  - хелперы форматирования и "cap" по тарифу
// ---------------------------------------------------------------

export type SubscriptionPlan = "free" | "plus" | "pro";

export type DailyStepsDoc = {
  date: string;          // YYYY-MM-DD
  steps: number;         // фактические шаги за день
  platform?: string;     // ios / android / web
  updatedAt?: any;       // Firestore timestamp или число
};

const MAX_STEPS: Record<SubscriptionPlan, number> = {
  free: 10000,
  plus: 15000,
  pro: 20000,
};

/**
 * Ключ для документов формата YYYY-MM-DD.
 * Должен совпадать с тем, что использует step-engine (runDailyDryRun).
 */
export function todayKey(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Обрезает шаги по лимиту тарифа (для превью на клиенте).
 * В боевом режиме сервер всё равно считает сам, но это удобно для UI.
 */
export function clampStepsByPlan(
  rawSteps: number,
  plan: SubscriptionPlan
): { counted: number; cap: number } {
  const cap = MAX_STEPS[plan] ?? MAX_STEPS.free;
  const counted = Math.max(0, Math.min(rawSteps || 0, cap));
  return { counted, cap };
}

/**
 * Форматирование количества шагов в человекочитаемый вид.
 */
export function formatSteps(
  steps: number | null | undefined,
  emptyLabel: string = "—"
): string {
  if (steps == null || !Number.isFinite(steps)) return emptyLabel;
  return steps.toLocaleString("en-US");
}

/**
 * Форматирование даты для UI.
 */
export function formatDateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
