// apps/mobile/src/lib/unlock.ts
import cfg from "../config/treasury.json";

/**
 * Строит массив дат анлоков по конфигу.
 */
export function buildTranches(
  lockStartISO = cfg.lockStart,
  tranches = cfg.tranches,
  monthsBetween = cfg.monthsBetween
): string[] {
  const dates: string[] = [];
  const start = new Date(lockStartISO);
  for (let i = 0; i < tranches; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i * monthsBetween);
    dates.push(d.toISOString());
  }
  return dates;
}

/**
 * Возвращает следующую дату анлока + индекс текущего пройденного шага и все даты.
 */
export function nextUnlock(nowMs = Date.now()) {
  const dates = buildTranches();
  const now = nowMs;

  // найдём первую дату в будущем
  let idx = dates.findIndex((iso) => new Date(iso).getTime() > now);

  // если все прошли — next = null, index = длина
  if (idx === -1) {
    return { next: null as string | null, index: dates.length, dates };
  }

  return { next: dates[idx], index: idx, dates };
}
