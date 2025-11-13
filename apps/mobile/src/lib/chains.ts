// apps/mobile/src/lib/chains.ts
import { ethers } from "ethers";

/**
 * Normalize env variable for BSC mainnet.
 * Primary source — EXPO_PUBLIC_*, fallback to RPC_BSC / CHAIN_ID_BSC.
 */
function env(key: string, fallback?: string): string {
  const v =
    (process.env as any)[key] ??
    (key === "EXPO_PUBLIC_RPC_URL" ? (process.env as any).RPC_BSC : undefined) ??
    fallback ??
    "";
  return (typeof v === "string" ? v.trim() : "").trim();
}

function assertHttpUrl(url: string, name: string) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(`[chains] ${name} must be a valid http(s) url, got "${url}"`);
  }
}

// -------- Chain config --------
export const BSC = {
  id: Number(env("EXPO_PUBLIC_CHAIN_ID", env("CHAIN_ID_BSC", "56"))),
  name: "BNB Smart Chain",
  rpc: env("EXPO_PUBLIC_RPC_URL", "https://bsc-dataseed.binance.org"),
  nativeSymbol: "BNB",
};

assertHttpUrl(BSC.rpc, "EXPO_PUBLIC_RPC_URL");

// -------- Addresses -----------
export const ADDR = {
  GAD: (env("ADDR_GAD") || "0x858bab88A5b8d7f29a40380c5f2d8d0b8812FE62") as `0x${string}`,
  USDT: (env("ADDR_USDT") || "0x55d398326f99059fF775485246999027B3197955") as `0x${string}`,
  PancakeV2Router: (env("ADDR_PANCAKE_ROUTER_V2") ||
    "0x10ED43C718714eb63d5aA57B78B54704E256024E") as `0x${string}`,
  Launchpad: (env("ADDR_LAUNCHPAD") ||
    "0x528e90A8304dCd05B351F1291eA34d7d74E4A08d") as `0x${string}`,
  VestingVault: (env("ADDR_VESTING_VAULT") ||
    "0x9653Cb1fc5daD8A384c2dAD18A4223b77eCF4A15") as `0x${string}`,
  LPLocker: (env("ADDR_LP_LOCKER") ||
    "0xF40B3dE6822837E0c4d937eF20D67B944aE39163") as `0x${string}`,
  TreasurySafe: (env("ADDR_TREASURY_SAFE") ||
    "0xe08F53ac892E89b6Ba431b90A96C640A39386736") as `0x${string}`,
  Governor: (env("ADDR_DAO_GOVERNOR") ||
    "0x6b07d69A2bE398e353f1877b81E116603837D556") as `0x${string}`,
  xGAD: (env("ADDR_XGAD") ||
    "0x2479158bFA2a0F164E7a1B9b7CaF8d3Ea2307ea1") as `0x${string}`,
} as const;

// -------- Provider (with cache) --------
let _provider: ethers.JsonRpcProvider | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (_provider) return _provider;
  _provider = new ethers.JsonRpcProvider(BSC.rpc, BSC.id);
  return _provider;
}

export const CHAINS = {
  bsc: { id: BSC.id, name: "BSC", rpc: BSC.rpc },
  bscTest: { id: 97, name: "BSC Testnet", rpc: BSC.rpc },
};
