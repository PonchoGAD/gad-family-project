import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { US_REGIONS } from "../config";
import { getFamilyPlanQuick, PLAN_APR_BONUS_BPS, Plan } from "./plans";
export {
  stakingListPools as stakingListPoolsCallable,
  stakingDeposit as stakingDepositCallable,
  stakingWithdraw as stakingWithdrawCallable,
  stakingClaimRewards as stakingClaimRewardsCallable
} from "./staking.js";


/**
 * Коллекции:
 * staking/pools/{pid}:
 *   - symbol:"GAD", lockMonths:0|1|3|6|12, minAmount, maxAmount, baseAprBps, subscribersOnly? Plan[],
 *     compoundingAllowed:boolean, earlyExitPenaltyBps:number, enabled:boolean, updatedAt
 *
 * users/{uid}/staking/positions/{id}:
 *   - poolId, amount, aprBpsFinal, accrued, since, status:"active"|"closed"|"pending_approval",
 *     compound:boolean, unlockAt, history[]
 *
 * users/{uid}/portfolioLedger — события: STAKE_OPEN, STAKE_APR, STAKE_CLAIM, UNSTAKE, EARLY_PENALTY
 */

/** === Admin: создать/обновить пул === */
export const upsertStakingPool = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const ADMINS = (process.env.ADMINS_UID_CSV || "").split(",").map(s=>s.trim()).filter(Boolean);
    if (!ADMINS.includes(uid)) throw new HttpsError("permission-denied", "Admin only");

    const {
      id, symbol, lockMonths, minAmount, maxAmount,
      baseAprBps, subscribersOnly, compoundingAllowed, earlyExitPenaltyBps, enabled
    } = req.data as {
      id?: string; symbol:"GAD";
      lockMonths: 0 | 1 | 3 | 6 | 12;
      minAmount: number; maxAmount: number;
      baseAprBps: number;
      subscribersOnly?: Plan[];
      compoundingAllowed?: boolean;
      earlyExitPenaltyBps?: number;
      enabled?: boolean;
    };

    if (symbol !== "GAD") throw new HttpsError("invalid-argument","Only GAD in MVP");
    if (minAmount <= 0 || maxAmount <= 0 || baseAprBps < 0) throw new HttpsError("invalid-argument","bad limits");

    const db = admin.firestore();
    const pid = id ?? db.collection("staking").doc("pools").collection("").doc().id;
    await db.collection("staking").doc("pools").collection("").doc(pid).set({
      symbol, lockMonths, minAmount, maxAmount,
      baseAprBps,
      subscribersOnly: subscribersOnly ?? [],
      compoundingAllowed: !!compoundingAllowed,
      earlyExitPenaltyBps: typeof earlyExitPenaltyBps === "number" ? earlyExitPenaltyBps : 500, // 5% по умолчанию
      enabled: enabled !== false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge:true });

    return { ok:true, poolId: pid };
  },
);

/** === Публичный список пулов === */
export const listStakingPools = onCall(
  { region: US_REGIONS },
  async () => {
    const db = admin.firestore();
    const snap = await db.collection("staking").doc("pools").collection("").where("enabled","==", true).get();
    const items = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) }));
    return { ok:true, items };
  },
);

/** === Открыть позицию === */
export const openStake = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { poolId, amount } = req.data as { poolId:string; amount:number };
    if (!poolId || !amount || amount <= 0) throw new HttpsError("invalid-argument","poolId/amount");

    const db = admin.firestore();
    const poolDoc = await db.collection("staking").doc("pools").collection("").doc(poolId).get();
    if (!poolDoc.exists) throw new HttpsError("not-found","pool");
    const pool = poolDoc.data() as any;
    if (!pool.enabled) throw new HttpsError("failed-precondition","Pool disabled");
    if (amount < pool.minAmount || amount > pool.maxAmount) throw new HttpsError("failed-precondition","Out of bounds");

    // бонус к APR по плану
    const u = await db.collection("users").doc(uid).get();
    const fid = u.data()?.familyId as string | undefined;
    if (!fid) throw new HttpsError("failed-precondition","Join family first");
    const plan = await getFamilyPlanQuick(db, fid);

    if (Array.isArray(pool.subscribersOnly) && pool.subscribersOnly.length > 0 && !pool.subscribersOnly.includes(plan)) {
      throw new HttpsError("permission-denied","Pool restricted to subscribers");
    }

    const aprBpsFinal = (pool.baseAprBps || 0) + (PLAN_APR_BONUS_BPS[plan] || 0);
    const since = admin.firestore.FieldValue.serverTimestamp();
    const unlockAt =
      pool.lockMonths > 0
        ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + pool.lockMonths * 30 * 86400000))
        : null;

    const ref = db.collection("users").doc(uid).collection("staking").doc("positions").collection("").doc();
    await ref.set({
      poolId, amount, aprBpsFinal, accrued: 0,
      since, unlockAt,
      status: "active",
      compound: !!pool.compoundingAllowed,       // по умолчанию включаем, если пул разрешает
      history: [],
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection("users").doc(uid).collection("portfolioLedger").add({
      kind: "STAKE_OPEN", poolId, amount, aprBpsFinal,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok:true, positionId: ref.id, aprBpsFinal, unlockAt };
  },
);

/** === Начисление наград (cron ежедневно) === */
export const accrueStakingRewardsV2 = onSchedule(
  { region: "us-east1", schedule: "10 3 * * *" },
  async () => {
    const db = admin.firestore();
    const users = await db.collection("users").get();
    for (const u of users.docs) {
      const uid = u.id;
      const posSnap = await db.collection("users").doc(uid).collection("staking").doc("positions").collection("").where("status","==","active").get();
      if (posSnap.empty) continue;

      for (const p of posSnap.docs) {
        const d:any = p.data();
        const apr = (d.aprBpsFinal ?? 0) / 10000;
        const daily = d.amount * (apr / 365);
        const inc = Math.floor(daily * 1e6) / 1e6;

        // компаундинг: если включён — наращиваем базу
        const newAmount = d.compound ? (d.amount + inc) : d.amount;
        const newAccrued = d.compound ? d.accrued : (d.accrued + inc);

        await p.ref.set({
          amount: newAmount,
          accrued: newAccrued,
          at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge:true });

        await db.collection("users").doc(uid).collection("portfolioLedger").add({
          kind: "STAKE_APR", positionId: p.id, amount: inc, currency:"GAD",
          at: admin.firestore.FieldValue.serverTimestamp(),
        });

        // уведомление раз в N дней: упрощённо — ежедневно
        const tokens: string[] = u.data()?.fcmTokens ?? u.data()?.expoTokens ?? [];
        if (tokens.length) {
          await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: "Staking rewards", body: `+${inc} GAD` },
            data: { kind: "apr_v2", positionId: p.id },
          });
        }
      }
    }
  },
);

/** === Клейм наград (для not compound) === */
export const claimStakingRewards = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { positionId } = req.data as { positionId:string };
    if (!positionId) throw new HttpsError("invalid-argument","positionId");

    const db = admin.firestore();
    const ref = db.collection("users").doc(uid).collection("staking").doc("positions").collection("").doc(positionId);
    const d:any = (await ref.get()).data(); if (!d) throw new HttpsError("not-found","position");
    if (d.status !== "active") throw new HttpsError("failed-precondition","not active");
    if (d.compound) throw new HttpsError("failed-precondition","compound enabled");

    const amount = d.accrued || 0;
    if (amount <= 0) return { ok:true, amount:0 };

    await ref.set({ accrued: 0, at: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
    await db.collection("users").doc(uid).collection("portfolioLedger").add({
      kind: "STAKE_CLAIM", positionId, amount, currency:"GAD",
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok:true, amount };
  },
);

/** === Переключить компаундинг === */
export const setStakingCompound = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { positionId, compound } = req.data as { positionId:string; compound:boolean };
    const db = admin.firestore();
    const ref = db.collection("users").doc(uid).collection("staking").doc("positions").collection("").doc(positionId);
    const cur = await ref.get(); if (!cur.exists) throw new HttpsError("not-found","position");
    await ref.set({ compound: !!compound, at: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
    return { ok:true };
  },
);

/** === Стандартный вывод по окончании срока или безлочный === */
export const closeStake = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { positionId } = req.data as { positionId:string };
    const db = admin.firestore();
    const ref = db.collection("users").doc(uid).collection("staking").doc("positions").collection("").doc(positionId);
    const d:any = (await ref.get()).data(); if (!d) throw new HttpsError("not-found","position");
    if (d.status !== "active") throw new HttpsError("failed-precondition","Already closed");

    // проверка локов
    const unlockAt = d.unlockAt?.toDate?.() ? d.unlockAt.toDate() : null;
    const early = unlockAt && unlockAt.getTime() > Date.now();
    if (early) throw new HttpsError("failed-precondition","Use earlyCloseStake for early exit");

    await ref.set({ status:"closed", closedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
    await db.collection("users").doc(uid).collection("portfolioLedger").add({
      kind: "UNSTAKE", positionId, at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok:true };
  },
);

/** === Ранний вывод со штрафом === */
export const earlyCloseStake = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { positionId } = req.data as { positionId:string };

    const db = admin.firestore();
    const ref = db.collection("users").doc(uid).collection("staking").doc("positions").collection("").doc(positionId);
    const d:any = (await ref.get()).data(); if (!d) throw new HttpsError("not-found","position");
    if (d.status !== "active") throw new HttpsError("failed-precondition","Already closed");

    const pool = (await db.collection("staking").doc("pools").collection("").doc(d.poolId).get()).data() as any;
    const unlockAt = d.unlockAt?.toDate?.() ? d.unlockAt.toDate() : null;
    if (!unlockAt || unlockAt.getTime() <= Date.now())
      throw new HttpsError("failed-precondition","Position not locked");

    const penaltyBps = pool.earlyExitPenaltyBps ?? 500;
    const penalty = Math.floor(d.amount * (penaltyBps / 10000) * 1e6) / 1e6;

    await ref.set({
      status:"closed",
      closedAt: admin.firestore.FieldValue.serverTimestamp(),
      earlyPenalty: penalty,
    }, { merge:true });

    await db.collection("users").doc(uid).collection("portfolioLedger").add({
      kind: "EARLY_PENALTY", positionId, amount: penalty, currency:"GAD",
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("users").doc(uid).collection("portfolioLedger").add({
      kind: "UNSTAKE", positionId, at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok:true, penalty };
  },
);

/** === Нотификации о скором окончании срока (7 дней и 1 день) === */
export const stakingMaturityNotifier = onSchedule(
  { region: "us-east1", schedule: "0 8 * * *" },
  async () => {
    const db = admin.firestore();
    const users = await db.collection("users").get();
    const DAY = 86400000;
    for (const u of users.docs) {
      const uid = u.id;
      const posSnap = await db.collection("users").doc(uid).collection("staking").doc("positions").collection("").where("status","==","active").get();
      if (posSnap.empty) continue;

      const tokens: string[] = u.data()?.fcmTokens ?? u.data()?.expoTokens ?? [];

      for (const p of posSnap.docs) {
        const d:any = p.data();
        const unlockAt = d.unlockAt?.toDate?.() ? d.unlockAt.toDate() : null;
        if (!unlockAt) continue;
        const left = unlockAt.getTime() - Date.now();
        const days = Math.ceil(left / DAY);

        if (days === 7 || days === 1) {
          await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: "Срок стейка близится к концу", body: days === 7 ? "Осталось 7 дней" : "Остался 1 день" },
            data: { kind: "stake_maturity", positionId: p.id, days: String(days) },
          });
        }
      }
    }
  },
);

export const stakingListPools = onCall(async () => {
  return { ok: true, pools: [] };
});

export const stakingDeposit = onCall(async (req) => {
  const { poolId, amount } = req.data ?? {};
  if (!poolId || !amount) throw new HttpsError("invalid-argument", "poolId & amount required");
  return { ok: true, txId: "stake_dep_mock" };
});

export const stakingWithdraw = onCall(async (req) => {
  const { poolId, amount } = req.data ?? {};
  if (!poolId || !amount) throw new HttpsError("invalid-argument", "poolId & amount required");
  return { ok: true, txId: "stake_wd_mock" };
});

export const stakingClaimRewards = onCall(async (req) => {
  const { poolId } = req.data ?? {};
  if (!poolId) throw new HttpsError("invalid-argument", "poolId required");
  return { ok: true, txId: "stake_claim_mock" };
});

// Алиасы

