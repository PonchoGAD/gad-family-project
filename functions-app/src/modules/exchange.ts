import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { US_REGIONS } from "../config";
export {
  exchangeQuote as exchangeQuoteCallable,
  exchangeSwap as exchangeSwapCallable
} from "./exchange.js";


/** ===== helpers ===== */
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
async function requireApprovalIfMinorOrLimit(
  db: FirebaseFirestore.Firestore,
  fid: string,
  uid: string,
  estUsd: number,
  payload: any,
) {
  const fam = await db.collection("families").doc(fid).get();
  const ownerUid = fam.data()?.ownerUid as string | undefined;
  const m = await db.collection("families").doc(fid).collection("members").doc(uid).get();
  const age = m.data()?.age ?? 0;
  const teen = age >= 14 && age < 18;
  const limit = m.data()?.spendingLimitUSD ?? 0;

  const start = new Date(); start.setUTCHours(0,0,0,0);
  const ledgerQ = await db.collection("users").doc(uid).collection("portfolioLedger").where("at", ">=", start).get();
  let spentToday = 0; ledgerQ.forEach((d) => { if (d.data().kind === "SPENT_USD") spentToday += d.data().amountUSD || 0; });

  const needApproval = age < 14 || (teen && limit > 0 && spentToday + estUsd > limit);
  if (needApproval) {
    const aRef = await db.collection("families").doc(fid).collection("approvals").add({
      type: "SWAP", payload, uid, status: "pending", at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { needApproval: true, approvalId: aRef.id, ownerUid };
  }
  return { needApproval: false, approvalId: null, ownerUid };
}
async function pushTo(tokens: string[], title: string, body: string, data: any = {}) {
  if (!tokens?.length) return;
  try { await admin.messaging().sendEachForMulticast({ tokens, notification: { title, body }, data }); } catch (e) { console.error("pushTo error:", e); }
}

/** ===== types ===== */
interface ExchangePolicy {
  monthlyUsdLimitPerFamily: number;
  maxOpsPerMonth: number;
  spreadBps: number;
  updatedAt: FirebaseFirestore.FieldValue;
}
interface ExchangeRates {
  GAD_USD: number;
  USDT_USD: number;
  updatedAt: FirebaseFirestore.FieldValue;
}

/** ===== API: set policy (owner) ===== */
export const setExchangePolicy = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { db, fid, famRef, fam } = await getFamilyContext(uid);
    if (fam.ownerUid !== uid) throw new HttpsError("permission-denied", "Only owner can set family policy");

    const { monthlyUsdLimitPerFamily, maxOpsPerMonth, spreadBps } = req.data as {
      monthlyUsdLimitPerFamily: number; maxOpsPerMonth: number; spreadBps: number;
    };
    if (monthlyUsdLimitPerFamily <= 0 || maxOpsPerMonth <= 0 || spreadBps < 0)
      throw new HttpsError("invalid-argument", "bad policy values");

    await famRef.collection("exchange").doc("policy").set({
      monthlyUsdLimitPerFamily, maxOpsPerMonth, spreadBps,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    } as ExchangePolicy, { merge: true });

    return { ok: true };
  },
);

/** ===== API: set public rates (admin) ===== */
export const setExchangeRates = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const ADMINS = (process.env.ADMINS_UID_CSV || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!ADMINS.includes(uid)) throw new HttpsError("permission-denied", "Admin only");

    const { GAD_USD, USDT_USD } = req.data as { GAD_USD: number; USDT_USD: number; };
    if (GAD_USD <= 0 || USDT_USD <= 0) throw new HttpsError("invalid-argument", "bad rates");

    await admin.firestore().collection("exchangePublic").doc("rates").set({
      GAD_USD, USDT_USD, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    } as ExchangeRates, { merge: true });

    return { ok: true };
  },
);

/** ===== API: request GAD -> USDT exchange (internal queue) ===== */
export const requestStableExchange = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { amountGAD } = req.data as { amountGAD: number };
    if (!amountGAD || amountGAD <= 0) throw new HttpsError("invalid-argument", "amountGAD > 0");

    const { db, fid, famRef } = await getFamilyContext(uid);

    const polDoc = await famRef.collection("exchange").doc("policy").get();
    const pol = (polDoc.data() as Partial<ExchangePolicy>) || {};
    const monthlyUsdLimitPerFamily = pol.monthlyUsdLimitPerFamily ?? 500;
    const maxOpsPerMonth = pol.maxOpsPerMonth ?? 2;
    const spreadBps = pol.spreadBps ?? 80;

    const ratesDoc = await db.collection("exchangePublic").doc("rates").get();
    const rates = (ratesDoc.data() as Partial<ExchangeRates>) || { GAD_USD: 0.003, USDT_USD: 1 };
    const gadUsd = rates.GAD_USD ?? 0.003;

    const usd = amountGAD * gadUsd;

    const appr = await requireApprovalIfMinorOrLimit(db, fid, uid, usd, { amountGAD, want: "USDT" });

    const startMonth = new Date(); startMonth.setUTCDate(1); startMonth.setUTCHours(0,0,0,0);
    const opsQ = await famRef.collection("exchangeOps").where("at", ">=", startMonth).get();
    let usedUsd = 0, opsCount = 0;
    opsQ.forEach((d) => { const x: any = d.data(); if (x.status === "executed") { usedUsd += x.usdApplied || 0; opsCount += 1; } });

    if (opsCount >= maxOpsPerMonth) throw new HttpsError("failed-precondition", "Monthly operation count reached");
    if (usedUsd + usd > monthlyUsdLimitPerFamily) throw new HttpsError("failed-precondition", "Monthly USD limit reached");

    const spread = (spreadBps / 10_000) * usd;
    const usdAfterSpread = Math.max(0, usd - spread);
    const usdtOut = usdAfterSpread;

    const opRef = await famRef.collection("exchangeOps").add({
      uid, amountGAD, estUSD: usd, usdAfterSpread, usdtOut,
      status: appr.needApproval ? "awaiting_approval" : "queued",
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (appr.needApproval && appr.ownerUid) {
      const ownerUser = await db.collection("users").doc(appr.ownerUid).get();
      const tokens: string[] = ownerUser.data()?.fcmTokens ?? [];
      await pushTo(tokens, "Exchange approval", "Family member requested exchange", { kind: "exchange_approval", opId: opRef.id });
    }

    return { ok: true, opId: opRef.id, approvalId: appr.approvalId ?? null };
  },
);

/** ===== API: owner approves queued exchange ===== */
export const approveExchangeOp = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const ownerUid = req.auth?.uid; if (!ownerUid) throw new HttpsError("unauthenticated", "Auth required");
    const { opId, approve } = req.data as { opId: string; approve: boolean };
    const { db, fid } = await getFamilyContext(ownerUid);
    const fam = await db.collection("families").doc(fid).get();
    if (fam.data()?.ownerUid !== ownerUid) throw new HttpsError("permission-denied", "Only owner");

    const opRef = db.collection("families").doc(fid).collection("exchangeOps").doc(opId);
    const op = await opRef.get(); if (!op.exists) throw new HttpsError("not-found", "op");

    await opRef.set({
      status: approve ? "queued" : "rejected",
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true };
  },
);

/** ===== CRON: process queue (simulate internal liquidity) ===== */
export const processExchangeQueue = onSchedule(
  { region: "us-east1", schedule: "*/10 * * * *" },
  async () => {
    const db = admin.firestore();
    const fams = await db.collection("families").get();
    for (const f of fams.docs) {
      const fid = f.id;
      const q = await db.collection("families").doc(fid).collection("exchangeOps").where("status", "==", "queued").limit(10).get();
      if (q.empty) continue;

      for (const op of q.docs) {
        const d: any = op.data();
        try {
          await op.ref.set({
            status: "executed",
            executedAt: admin.firestore.FieldValue.serverTimestamp(),
            usdApplied: d.usdAfterSpread,
          }, { merge: true });

          await db.collection("families").doc(fid).collection("exchangeJournal").add({
            opId: op.id, uid: d.uid, gadIn: d.amountGAD, usdtOut: d.usdtOut, usdApplied: d.usdAfterSpread,
            at: admin.firestore.FieldValue.serverTimestamp(),
          });

          const u = await db.collection("users").doc(d.uid).get();
          const tokens: string[] = u.data()?.fcmTokens ?? [];
          await pushTo(tokens, "Exchange executed", "Your GAD→USDT exchange is completed", { kind: "exchange_done", opId: op.id });
        } catch (e) {
          await op.ref.set({
            status: "failed", error: String(e), failedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }
    }
  },
);

/** ===== API: list exchange history ===== */
export const listExchangeHistory = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { db, fid } = await getFamilyContext(uid);
    const snap = await db.collection("families").doc(fid).collection("exchangeJournal").orderBy("at", "desc").limit(100).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return { ok: true, items };
  },
);

export const exchangeQuote = onCall(async (req) => {
  const { from, to, amount } = req.data ?? {};
  if (!from || !to || !amount) throw new HttpsError("invalid-argument", "from,to,amount required");
  return { ok: true, price: 1, estimatedOut: amount };
});

export const exchangeSwap = onCall(async (req) => {
  const { from, to, amount } = req.data ?? {};
  if (!from || !to || !amount) throw new HttpsError("invalid-argument", "from,to,amount required");
  return { ok: true, txId: "swap_tx_mock" };
});

// Алиасы
