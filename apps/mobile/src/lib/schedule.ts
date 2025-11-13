// apps/mobile/src/lib/schedule.ts

/**
 * Build array of tranche dates (YYYY-MM-DD) with a fixed month step.
 */
export function buildTranches(startISO: string, count: number, months: number): string[] {
  const out: string[] = [];
  const base = new Date(startISO + "T00:00:00Z");

  for (let i = 1; i <= count; i++) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + months * i);
    out.push(d.toISOString().slice(0, 10));
  }

  return out;
}

/**
 * Find next unlock date and its index inside schedule.
 */
export function nextUnlock(dates: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  const next = dates.find((d) => d >= today) || null;
  const index = next ? dates.indexOf(next) : dates.length - 1;
  return { next, index };
}
