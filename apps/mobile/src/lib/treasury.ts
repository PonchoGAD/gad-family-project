// apps/mobile/src/lib/treasury.ts

import { getGadBalance } from "./gadToken";
import { ADDR } from "./chains";

/**
 * MAIN TREASURY SAFE ADDRESS
 * Priority:
 *   1) EXPO_PUBLIC_TREASURY_ADDRESS (runtime override)
 *   2) ADDR.TreasurySafe (on-chain config)
 */
export const TREASURY = (
  process.env.EXPO_PUBLIC_TREASURY_ADDRESS || ADDR.TreasurySafe
) as `0x${string}`;

/**
 * GLOBAL VESTING CONTRACT (team, advisors, ecosystem locks)
 * Priority:
 *   1) EXPO_PUBLIC_VESTING_VAULT
 *   2) ADDR.VestingVault
 */
export const VESTING_VAULT = (
  process.env.EXPO_PUBLIC_VESTING_VAULT || ADDR.VestingVault
) as `0x${string}`;

/**
 * Returns the GAD token balance of the main Treasury SAFE.
 * Result:
 *   { raw: bigint, pretty: string }
 */
export async function getTreasuryBalance() {
  return getGadBalance(TREASURY);
}
