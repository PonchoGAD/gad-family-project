import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { US_REGIONS } from "../config";

/** === helpers / context === */
async function getFamilyContext(uid: string) {
  const db = admin.firestore();
  const u = await db.collection("users").doc(uid).get();
  const fid = u.data()?.familyId as string | undefined;
  if (!fid) throw new HttpsError("failed-precondition", "Join family first");
  const famRef = db.collection("families").doc(fid);
  const fam = (await famRef.get()).data();
  if (!fam) throw new HttpsError("not-found", "Family not found");
  return { db, fid, famRef, fam };
}

/** === тарифные матрицы и бонусы === */
export type Plan = "BASIC" | "FAMILY" | "PRO";

export const PLAN_GAS_SCALE: Record<Plan, number> = {
  BASIC: 1,
  FAMILY: 1.5,
  PRO: 2,
};

export const PLAN_APR_BONUS_BPS: Record<Plan, number> = {
  BASIC: 0,
  FAMILY: 100,
  PRO: 200,
};

export const PLAN_MATRIX = {
  BASIC: {
    gasScale: 1,
    exchangeCapUSDMonth: 500,
    personalGoalSlots: 3,
    assistantQuota: 100,
    stakeAprBonusBps: 0,
  },
  FAMILY: {
    gasScale: 1.5,
    exchangeCapUSDMonth: 2000,
    personalGoalSlots: 8,
    assistantQuota: 300,
    stakeAprBonusBps: 100,
  },
  PRO: {
    gasScale: 2,
    exchangeCapUSDMonth: 10000,
    personalGoalSlots: 20,
    assistantQuota: 1000,
    stakeAprBonusBps: 200,
  },
} as const;

/** Быстрый доступ к плану семьи */
export async function getFamilyPlanQuick(
  db: FirebaseFirestore.Firestore,
  fid: string,
): Promise<Plan> {
  const snap = await db
    .collection("families")
    .doc(fid)
    .collection("billing")
    .doc("subscription")
    .get();
  return (snap.data()?.plan as Plan) || "BASIC";
}

/** Внутреннее списание газа из резерва (экспортируем для других модулей) */
export async function spendGasReserveInternal(
  db: FirebaseFirestore.Firestore,
  fid: string,
  amountBNB: number,
  reason: string,
) {
  const famRef = db.collection("families").doc(fid);
  const subRef = famRef.collection("billing").doc("subscription");
  await famRef.collection("gasLedger").add({
    type: "DEBIT",
    reason,
    amountBNB,
    at: admin.firestore.FieldValue.serverTimestamp(),
  });
  await subRef.set(
    {
      gasReserveBNB: admin.firestore.FieldValue.increment(
        -Math.abs(amountBNB),
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** === API: выбрать/сменить план === */
export const setFamilyPlan = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { plan, autoRenew } = req.data as { plan: Plan; autoRenew?: boolean };
    const { famRef, fam } = await getFamilyContext(uid);
    if (fam.ownerUid !== uid)
      throw new HttpsError("permission-denied", "Only owner");
    await famRef.collection("billing").doc("subscription").set(
      {
        plan,
        autoRenew: !!autoRenew,
        paused: false,
        gasReserveBNB: admin.firestore.FieldValue.increment(0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { ok: true };
  },
);

/** === API: получить текущий план === */
export const getFamilyPlan = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { famRef } = await getFamilyContext(uid);
    const snap = await famRef.collection("billing").doc("subscription").get();
    return { ok: true, sub: snap.data() || null };
  },
);

/** === API: пауза подписки === */
export const pauseFamilyPlan = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { paused } = req.data as { paused: boolean };
    const { famRef, fam } = await getFamilyContext(uid);
    if (fam.ownerUid !== uid)
      throw new HttpsError("permission-denied", "Only owner");
    await famRef.collection("billing").doc("subscription").set(
      {
        paused: !!paused,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { ok: true };
  },
);

/**
 * === API (вебхук платёжки): processSubscriptionPayment ===
 * ⚠️ здесь предполагается, что ты добавишь проверку подписи от платёжки.
 * Распределяем часть оплаты ($ → BNB) в неснимаемый газ-резерв.
 */
export const processSubscriptionPayment = onCall(
  { region: US_REGIONS, secrets: ["PRICE_MAP_USD"] as any },
  async (req: any) => {
    const { fid, amountUSD, invoiceId } = req.data as {
      fid: string;
      amountUSD: number;
      invoiceId: string;
    };
    if (!fid || !amountUSD)
      throw new HttpsError("invalid-argument", "fid/amountUSD");

    const db = admin.firestore();
    const famRef = db.collection("families").doc(fid);
    const subRef = famRef.collection("billing").doc("subscription");
    const sub = (await subRef.get()).data() || {};
    if (sub.paused) return { ok: true, skipped: true };

    // в MVP берём курсы из публичного справочника (или прокидывай секрет как раньше)
    const priceDoc = await db.collection("exchangePublic").doc("rates").get();
    const price = priceDoc.data() || {};
    const bnbUsd = price["BNB_USD"] || price["BNB"] || 0;

    const stipendUsd = Math.floor(amountUSD * 0.3 * 100) / 100; // 30%
    const stipendBNB = bnbUsd > 0 ? stipendUsd / bnbUsd : 0;

    await famRef.collection("gasLedger").add({
      type: "CREDIT",
      invoiceId,
      amountUSD,
      stipendUsd,
      stipendBNB,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await subRef.set(
      {
        gasReserveBNB: admin.firestore.FieldValue.increment(stipendBNB),
        renewedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { ok: true, stipendBNB };
  },
);

/** === API: льготы/энтитльменты по плану === */
export const getPlanEntitlements = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { db } = await getFamilyContext(uid);

    const u = await db.collection("users").doc(uid).get();
    const fid = u.data()?.familyId as string;
    const plan = await getFamilyPlanQuick(db, fid);

    const entitlements = {
      avatars: plan === "BASIC" ? 5 : plan === "FAMILY" ? 12 : 20,
      swapFeeDiscountPct: plan === "PRO" ? 20 : plan === "FAMILY" ? 10 : 0,
      stakeAprBonusBps: PLAN_APR_BONUS_BPS[plan],
      goalSlots: plan === "BASIC" ? 3 : plan === "FAMILY" ? 8 : 20,
      assistantQuota: plan === "BASIC" ? 100 : plan === "FAMILY" ? 300 : 1000,
    };
    return { ok: true, plan, entitlements };
  },
);

/** === API: отдать клиенту всю таблицу планов === */
export const getPlanMatrix = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async () => ({ ok: true, matrix: PLAN_MATRIX }),
);
