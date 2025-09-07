import { getGadBalance } from "./gadToken";

export const TREASURY = process.env.EXPO_PUBLIC_TREASURY_ADDRESS!;
export const VESTING_VAULT = process.env.EXPO_PUBLIC_VESTING_VAULT!;

export async function getTreasuryBalance() {
  return getGadBalance(TREASURY);
}
