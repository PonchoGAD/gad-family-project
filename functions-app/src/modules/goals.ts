import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { US_REGIONS } from "../config";

/** ===== currencies ===== */
const CURRENCIES = ["GAD", "BNB", "USDT"] as const;
type Currency = (typeof CURRENCIES)[number];
function isCurrency(x: any): x is Currency { return CURRENCIES.includes(x); }

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
  db: FirebaseFirestore.Firestore, fid: string, uid: string, estUsd: number, payload: any,
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
      type: "STAKE", payload, uid, status: "pending", at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { needApproval: true, approvalId: aRef.id, ownerUid };
  }
  return { needApproval: false, approvalId: null, ownerUid };
}

/** ===== types ===== */
interface Goal {
  title: string;
  currencies: Currency[];
  targetByISO?: string | null;
  targetAmountByCurrency: Partial<Record<Currency, number>>;
  softLock: boolean;
  image?: string | null;
  autoPctFromPersonalIncome?: number;
  paused?: boolean;
  createdAt: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
  familyId: string;
}
interface GoalState {
  balance: Partial<Record<Currency, number>>;
  history?: any[];
}

/** ===== API: create goal ===== */
export const createPersonalGoal = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const {
      title, currencies, targetByISO, targetAmountByCurrency, softLock, image, autoPctFromPersonalIncome,
    } = req.data as Partial<Goal> & { targetAmountByCurrency?: Record<string, number> };

    if (!title || !Array.isArray(currencies) || currencies.length === 0)
      throw new HttpsError("invalid-argument", "title/currencies required");

    const currs: Currency[] = [];
    for (const c of currencies) { if (!isCurrency(c)) throw new HttpsError("invalid-argument", "bad currency"); currs.push(c); }

    const { db, fid } = await getFamilyContext(uid);
    const gRef = db.collection("users").doc(uid).collection("goals").doc();
    await gRef.set({
      title,
      currencies: currs,
      targetByISO: targetByISO ?? null,
      targetAmountByCurrency: Object.fromEntries(
        Object.entries(targetAmountByCurrency ?? {}).filter(([k, v]) => isCurrency(k) && typeof v === "number"),
      ),
      softLock: !!softLock,
      image: image ?? null,
      autoPctFromPersonalIncome:
        typeof autoPctFromPersonalIncome === "number" ? Math.max(0, Math.min(100, autoPctFromPersonalIncome)) : 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      familyId: fid,
    } as Goal);

    await gRef.collection("state").doc("main").set({ balance: {}, history: [] } as GoalState);
    return { ok: true, goalId: gRef.id };
  },
);

/** ===== API: update goal ===== */
export const updatePersonalGoal = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { goalId, patch } = req.data as { goalId: string; patch: Partial<Goal>; };
    if (!goalId) throw new HttpsError("invalid-argument", "goalId");

    const db = admin.firestore();
    const gRef = db.collection("users").doc(uid).collection("goals").doc(goalId);
    const cur = await gRef.get(); if (!cur.exists) throw new HttpsError("not-found", "goal");

    const editable: Partial<Goal> = {};
    if (typeof patch.title === "string") editable.title = patch.title;
    if (Array.isArray(patch.currencies)) editable.currencies = patch.currencies.filter(isCurrency) as Currency[];
    if (typeof patch.softLock === "boolean") editable.softLock = patch.softLock;
    if (typeof patch.image === "string" || patch.image === null) editable.image = patch.image ?? null;
    if (typeof patch.autoPctFromPersonalIncome === "number") editable.autoPctFromPersonalIncome = Math.max(0, Math.min(100, patch.autoPctFromPersonalIncome));
    if (typeof patch.targetByISO === "string" || patch.targetByISO === null) editable.targetByISO = patch.targetByISO ?? null;
    if (patch.targetAmountByCurrency && typeof patch.targetAmountByCurrency === "object") {
      editable.targetAmountByCurrency = Object.fromEntries(
        Object.entries(patch.targetAmountByCurrency).filter(([k, v]) => isCurrency(k) && typeof v === "number"),
      ) as any;
    }
    editable.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await gRef.set(editable, { merge: true });
    return { ok: true };
  },
);

/** ===== API: contribute ===== */
export const contributeToGoal = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { goalId, currency, amount } = req.data as { goalId: string; currency: Currency; amount: number; };
    if (!goalId || !isCurrency(currency) || amount <= 0) throw new HttpsError("invalid-argument", "bad params");

    const db = admin.firestore();
    const gRef = db.collection("users").doc(uid).collection("goals").doc(goalId);
    const stRef = gRef.collection("state").doc("main");
    const g = await gRef.get(); if (!g.exists) throw new HttpsError("not-found", "goal");

    await stRef.set({ balance: { [currency]: admin.firestore.FieldValue.increment(amount) } }, { merge: true });
    await gRef.collection("history").add({
      kind: "contribution", currency, amount, at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true };
  },
);

/** ===== API: withdrawal request (with approval/lock rules) ===== */
export const requestGoalWithdrawal = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { goalId, currency, amount } = req.data as { goalId: string; currency: Currency; amount: number; };
    if (!goalId || !isCurrency(currency) || amount <= 0) throw new HttpsError("invalid-argument", "bad params");

    const { db, fid } = await getFamilyContext(uid);
    const gRef = db.collection("users").doc(uid).collection("goals").doc(goalId);
    const g = await gRef.get(); if (!g.exists) throw new HttpsError("not-found", "goal");
    const goal = g.data() as Goal;

    const unlock = goal.targetByISO ? new Date(goal.targetByISO) : null;
    const locked = !goal.softLock && unlock && unlock.getTime() > Date.now();

    // в MVP считаем amount как USD-эквивалент, чтобы триггерить approval (как в исходнике)
    const usdApprox = amount;
    const appr = await requireApprovalIfMinorOrLimit(db, fid, uid, usdApprox, { goalId, currency, amount });

    if (locked && appr.needApproval === false) {
      throw new HttpsError("failed-precondition", "Goal is time-locked");
    }

    const reqRef = await gRef.collection("withdrawals").add({
      currency, amount,
      status: appr.needApproval ? "awaiting_approval" : locked ? "awaiting_approval" : "queued",
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, wid: reqRef.id };
  },
);

/** ===== CRON: auto-contribution from personal income (daily) ===== */
export const autoContributeGoals = onSchedule(
  { region: "us-east1", schedule: "15 4 * * *" },
  async () => {
    const db = admin.firestore();
    const users = await db.collection("users").get();
    for (const u of users.docs) {
      const uid = u.id;
      const goalsSnap = await db.collection("users").doc(uid).collection("goals")
        .where("autoPctFromPersonalIncome", ">", 0).get();
      if (goalsSnap.empty) continue;

      const y = new Date(); y.setDate(y.getDate() - 1);
      const dayKey = y.toISOString().slice(0, 10);
      const earnDoc = await db.collection("earnings").doc(uid).collection("").doc(dayKey).get();
      const base = earnDoc.data()?.pointsAwarded ?? 0;
      if (base <= 0) continue;

      for (const g of goalsSnap.docs) {
        const autoPct = (g.data().autoPctFromPersonalIncome ?? 0) as number;
        if (autoPct <= 0) continue;
        const add = Math.floor((base * autoPct) / 100); if (add <= 0) continue;

        await db.collection("users").doc(uid).collection("goals").doc(g.id).collection("state").doc("main")
          .set({ balance: { GAD: admin.firestore.FieldValue.increment(add) } }, { merge: true });

        await db.collection("users").doc(uid).collection("goals").doc(g.id).collection("history").add({
          kind: "auto_contribution", currency: "GAD", amount: add, at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  },
);

/** ===== API: list goals (with state) ===== */
export const listPersonalGoals = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const db = admin.firestore();
    const goals = await db.collection("users").doc(uid).collection("goals").orderBy("createdAt", "desc").limit(50).get();

    const items: any[] = [];
    for (const g of goals.docs) {
      const state = await g.ref.collection("state").doc("main").get();
      items.push({ id: g.id, ...(g.data() as any), state: state.data() ?? { balance: {} } });
    }
    return { ok: true, items };
  },
);
