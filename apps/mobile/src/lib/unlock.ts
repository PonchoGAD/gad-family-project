import { TREASURY } from "../config/treasury";

export function trancheDates(): string[] {
  const out: string[] = [];
  const start = new Date(TREASURY.LOCK_START_ISO + "T00:00:00Z");
  for (let i=1;i<=TREASURY.TRANCHES;i++){
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + TREASURY.MONTHS_BETWEEN * i);
    out.push(d.toISOString().slice(0,10));
  }
  return out;
}

export function nextUnlock() {
  const dates = trancheDates();
  const today = new Date().toISOString().slice(0,10);
  const next = dates.find(d => d >= today) || null;
  const idx = next ? dates.indexOf(next) : dates.length-1;
  return { dates, next, index: idx };
}
