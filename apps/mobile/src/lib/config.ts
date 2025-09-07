export const US_REGIONS = ["us-east4", "us-west1"]; // можно добавить "us-central1"

export const PUBLIC_TREASURY_CONFIG = {
  // TODO: впиши адреса (нижний регистр)
  TOKEN_ADDRESS: "0x858bab88A5b8D7F29a40380C5F2D8d0b8812FE62",           // адрес GAD ERC-20 (BSC)
  TEAM_FINANCE_LOCK: "0x_team_finance_lock_contract",
  TREASURY_SAFE: "0x_treasury_safe",
  DISTRIBUTION_SAFE: "0xe08F53ac892E89b6Ba431b90A96C640A39386736",
  HOT_PAYOUT_WALLET: "0xA5f7ce6308333f9A596A498DcAaae6D30F1bB094",


  DECIMALS: 18,                   // если у GAD другие — поменяй
  LOCK_START_ISO: "2025-09-09",   // дата начала лока (ISO)
  TRANCHES: 10,
  MONTHS_BETWEEN: 6,
  TRANCHE_RAW: "500000000000",    // 500B без учёта decimals (RAW «целые» токены)
};

export type TreasuryPublic = typeof PUBLIC_TREASURY_CONFIG;

export const TREASURY = {
  // ...
  DISTRIBUTION_SAFE: "0xe08F53ac892E89b6Ba431b90A96C640A39386736",
  HOT_PAYOUT_WALLET: "0xA5f7ce6308333f9A596A498DcAaae6D30F1bB094",
};