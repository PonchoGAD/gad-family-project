// apps/mobile/src/lib/unlock.ts

/**
 * Basic unlock schedule config.
 * Values can be overridden via ENV to avoid hardcoding.
 */
const LOCK_START_ISO =
  process.env.EXPO_PUBLIC_TREASURY_LOCK_START || "2025-11-24"; // YYYY-MM-DD
const TRANCHES = Number(
  process.env.EXPO_PUBLIC_TREASURY_TRANCHES || "6"
);
const MONTHS_BETWEEN = Number(
  process.env.EXPO_PUBLIC_TREASURY_MONTHS_BETWEEN || "6"
);

/**
 * Build array of unlock datetimes (full ISO timestamps).
 */
export function buildTranches(
  lockStartISO: string = LOCK_START_ISO,
  tranches: number = TRANCHES,
  monthsBetween: number = MONTHS_BETWEEN
): string[] {
  const dates: string[] = [];
  const start = new Date(lockStartISO + "T00:00:00Z");

  for (let i = 0; i < tranches; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i * monthsBetween);
    dates.push(d.toISOString());
  }

  return dates;
}

/**
 * Returns next unlock date (full ISO) + index and full schedule.
 */
export function nextUnlock(nowMs: number = Date.now()) {
  const dates = buildTranches();
  const now = nowMs;

  // find first future unlock
  let idx = dates.findIndex(
    (iso) => new Date(iso).getTime() > now
  );

  // all tranches passed
  if (idx === -1) {
    return {
      next: null as string | null,
      index: dates.length,
      dates,
    };
  }

  return {
    next: dates[idx],
    index: idx,
    dates,
  };
}
