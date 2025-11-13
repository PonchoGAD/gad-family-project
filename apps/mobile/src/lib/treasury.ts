// apps/mobile/src/lib/treasury.ts
import { getGadBalance } from "./gadToken";
import { ADDR } from "./chains";

// Prefer EXPO_PUBLIC_* if set, otherwise fallback to on-chain config from ./chains.
export const TREASURY = (
  process.env.EXPO_PUBLIC_TREASURY_ADDRESS || ADDR.TreasurySafe
) as `0x${string}`;

export const VESTING_VAULT = (
  process.env.EXPO_PUBLIC_VESTING_VAULT || ADDR.VestingVault
) as `0x${string}`;

/**
 * Read GAD token balance for the main treasury address.
 */
export async function getTreasuryBalance() {
  return getGadBalance(TREASURY);
}
