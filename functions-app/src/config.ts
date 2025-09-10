import { defineSecret } from "firebase-functions/params";
import { CallableOptions } from "firebase-functions/v2/https";
export const REGION: string = "us-east1";
export const US_REGIONS: string[] = [REGION];
export const CALLABLE_OPTS = { region: REGION } as const;
// src/config.ts


/** Публичная конфигурация казначейства */
export const PUBLIC_TREASURY_CONFIG = {
  TOKEN_ADDRESS: "0x858bab88A5b8D7F29a40380C5F2D8d0b8812FE62",
  DECIMALS: 18,
};
export type TreasuryPublic = typeof PUBLIC_TREASURY_CONFIG;

/** Секреты (единая точка импорта) */
export const SECRETS = {
  BSC_RPC_URL: defineSecret("BSC_RPC_URL"),
  PAYOUT_PK: defineSecret("PAYOUT_PK"),
  GAD_TOKEN_ADDRESS: defineSecret("GAD_TOKEN_ADDRESS"),
  DISTRIBUTION_SAFE: defineSecret("DISTRIBUTION_SAFE"),
  TOKEN_DECIMALS: defineSecret("TOKEN_DECIMALS"),
  ALLOW_ONCHAIN_EXECUTION: defineSecret("ALLOW_ONCHAIN_EXECUTION"),
  PANCAKE_ROUTER_ADDRESS: defineSecret("PANCAKE_ROUTER_ADDRESS"),
  WBNB_ADDRESS: defineSecret("WBNB_ADDRESS"),
  USDT_ADDRESS: defineSecret("USDT_ADDRESS"),
  GT_ADDRESS: defineSecret("GT_ADDRESS"),
  NFT_MINT_CONTRACT: defineSecret("NFT_MINT_CONTRACT"),
  PRICE_MAP_USD: defineSecret("PRICE_MAP_USD")
};
