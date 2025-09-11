// functions-app/src/index.ts

import * as admin from "firebase-admin";
admin.initializeApp();

// Базовая конфигурация / типы
export * from "./config.js";

// Core-модули
export * from "./modules/treasury.js";
export * from "./modules/steps.js";
export * from "./modules/geo.js";
export * from "./modules/ownership.js";
export * from "./modules/vault.js";
export * from "./modules/defi.js";
export * from "./modules/assistant.js";
export * from "./modules/discovery.js";
export * from "./modules/exchange.js";
export * from "./modules/goals.js";
export * from "./modules/custody.js";
export * from "./modules/plans.js";

// Новые промпты 18–21
export * from "./modules/referrals.js";   // PROMPT 18
export * from "./modules/alarm.js";       // PROMPT 19
export * from "./modules/gasReserve.js";  // PROMPT 20
export * from "./modules/staking.js";     // PROMPT 21

// Семейный чат (отдельный модуль)
export * from "./modules/chat.js";

// Совместимость с mobileV1 (ТОЛЬКО один экспорт compat!)
export * from "./compat/mobileV1.js";
