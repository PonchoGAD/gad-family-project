// apps/mobile/src/lib/exchange.ts
import { fn } from "./functionsClient";

export const getExchangeLimits = fn<{}, { maxUsd: number; maxGad: number }>(
  "getExchangeLimits"
);

export const requestExchange = fn<
  { gad: number; address: string },
  { ok: boolean }
>("requestExchange");
