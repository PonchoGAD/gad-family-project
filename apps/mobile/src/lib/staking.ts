// apps/mobile/src/lib/staking.ts

import { httpsCallable } from "firebase/functions";
import { functions, auth } from "../firebase";

export type StakingInfo = {
  staked: number;  // total user staked GAD (human-readable, e.g. 1234.56)
  rewards: number; // pending rewards GAD (human-readable)
  apr: number;     // APR / APY in %
};

/**
 * Get staking dashboard info for current user.
 * Cloud Function "stakingGetInfo" должна вернуть:
 * {
 *   staked: number;
 *   rewards: number;
 *   apr: number;
 * }
 */
export async function getStakingInfo(): Promise<StakingInfo> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");

  const callable = httpsCallable(functions, "stakingGetInfo");
  const res = await callable({});
  const data = res.data as any;

  return {
    staked: typeof data?.staked === "number" ? data.staked : 0,
    rewards: typeof data?.rewards === "number" ? data.rewards : 0,
    apr: typeof data?.apr === "number" ? data.apr : 12,
  };
}

/**
 * Stake GAD tokens (amount in human units, e.g. 100.5).
 * CF "stakingStake" принимает { amount: number }.
 */
export async function stake(amount: number) {
  if (!amount || amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const callable = httpsCallable(functions, "stakingStake");
  const res = await callable({ amount });
  return res.data;
}

/**
 * Unstake GAD tokens (amount in human units).
 * CF "stakingUnstake" принимает { amount: number }.
 */
export async function unstake(amount: number) {
  if (!amount || amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const callable = httpsCallable(functions, "stakingUnstake");
  const res = await callable({ amount });
  return res.data;
}

/**
 * Claim all pending rewards.
 * CF "stakingClaim" без параметров.
 */
export async function claimRewards() {
  const callable = httpsCallable(functions, "stakingClaim");
  const res = await callable({});
  return res.data;
}
