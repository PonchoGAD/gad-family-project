export const US_REGIONS = "us-east4" as const; // или массив / строку, как у тебя было

export type TreasuryPublic = {
  TOKEN_ADDRESS: string;
  DECIMALS: number;
  LOCK_START_ISO: string;
  TRANCHES: number;
  MONTHS_BETWEEN: number;
  // + любые другие поля, которые ты используешь для витрины
};

export const PUBLIC_TREASURY_CONFIG: TreasuryPublic = {
  TOKEN_ADDRESS: "0x858bab88A5b8d7f29a40380c5f2d8d0b8812FE62",
  DECIMALS: 18,
  LOCK_START_ISO: "2025-11-24",
  TRANCHES: 6,
  MONTHS_BETWEEN: 6,
  // ...
};
