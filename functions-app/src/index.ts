import * as admin from "firebase-admin";
admin.initializeApp();

// базовая конфигурация/типы
export * from "./config";

// core-модули (перенос из большого index.ts)
export * from "./modules/treasury";
export * from "./modules/steps";
export * from "./modules/geo";
export * from "./modules/ownership";
export * from "./modules/vault";
export * from "./modules/defi";
export * from "./modules/assistant";
export * from "./modules/discovery";
export * from "./modules/exchange";
export * from "./modules/goals";
export * from "./modules/custody";
export * from "./modules/plans";

// новые промпты 18-21
export * from "./modules/referrals";   // PROMPT 18
export * from "./modules/alarm";       // PROMPT 19
export * from "./modules/gasReserve";  // PROMPT 20
export * from "./modules/staking";     // PROMPT 21

// семейный чат (отдельный модуль)
export * from "./modules/chat";

export * from "./compat/mobileV1.js";
