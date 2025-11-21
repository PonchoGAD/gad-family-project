// apps/mobile/src/lib/exchange.ts

import { fn } from "./functionsClient";

/**
 * Get exchange limits for current user.
 * CF "getExchangeLimits" должна вернуть:
 * { maxUsd: number; maxGad: number }
 */
export const getExchangeLimits = fn<{}, { maxUsd: number; maxGad: number }>(
  "getExchangeLimits"
);

/**
 * Request GAD → USDT (или USDT/BNB под капотом).
 * CF "requestExchange" принимает:
 * { gad: number; address: string }
 * и создаёт запись в Firestore + ончейн-обработку.
 */
export const requestExchange = fn<
  { gad: number; address: string },
  { ok: boolean }
>("requestExchange");
