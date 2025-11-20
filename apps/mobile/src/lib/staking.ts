// apps/mobile/src/lib/staking.ts

import { httpsCallable } from "firebase/functions";
import { functions, auth } from "../firebase";

export type StakingInfo = {
  staked: number;
  rewards: number;
  apr: number;
};

export async function getStakingInfo(): Promise<StakingInfo> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");

  const callable = httpsCallable(functions, "stakingGetInfo");
  const res = await callable({});
  const data = res.data as any;

  return {
    staked: data.staked ?? 0,
    rewards: data.rewards ?? 0,
    apr: data.apr ?? 12,
  };
}

export async function stake(amount: number) {
  const callable = httpsCallable(functions, "stakingStake");
  const res = await callable({ amount });
  return res.data;
}

export async function unstake(amount: number) {
  const callable = httpsCallable(functions, "stakingUnstake");
  const res = await callable({ amount });
  return res.data;
}

export async function claimRewards() {
  const callable = httpsCallable(functions, "stakingClaim");
  const res = await callable({});
  return res.data;
}
