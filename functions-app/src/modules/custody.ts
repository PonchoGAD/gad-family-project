import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { US_REGIONS } from "../config";
export {
  custodySetRules as custodySetRulesCallable,
  custodyApproveTx as custodyApproveTxCallable
} from "./custody.js";


/** === helpers === */
function computeAge(dobISO: string) {
  const dob = new Date(dobISO + "T00:00:00Z");
  const today = new Date();
  const years = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  const d = today.getUTCDate() - dob.getUTCDate();
  return years - (m < 0 || (m === 0 && d < 0) ? 1 : 0);
}
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

/** === API: родитель задаёт правила трат ребёнка === */
export const setChildSpendRules = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const ownerUid = req.auth?.uid;
    if (!ownerUid) throw new HttpsError("unauthenticated", "Auth required");
    const { targetUid, dailyUSD, weeklyUSD, monthlyUSD, whitelist, blacklist } =
      req.data as {
        targetUid: string;
        dailyUSD?: number;
        weeklyUSD?: number;
        monthlyUSD?: number;
        whitelist?: string[];
        blacklist?: string[];
      };

    const { fid, famRef, fam } = await getFamilyContext(ownerUid);
    if (fam.ownerUid !== ownerUid)
      throw new HttpsError("permission-denied", "Only owner");

    const mRef = famRef.collection("members").doc(targetUid);
    const patch: any = {
      custodial: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (typeof dailyUSD === "number") patch.spendingLimitUSDDaily = dailyUSD;
    if (typeof weeklyUSD === "number") patch.spendingLimitUSDWeekly = weeklyUSD;
    if (typeof monthlyUSD === "number")
      patch.spendingLimitUSDMonthly = monthlyUSD;
    if (Array.isArray(whitelist)) patch.categoryWhitelist = whitelist;
    if (Array.isArray(blacklist)) patch.categoryBlacklist = blacklist;

    await mRef.set(patch, { merge: true });

    await famRef.collection("ledger").add({
      action: "setChildSpendRules",
      actorUid: ownerUid,
      details: { targetUid, ...patch },
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true };
  },
);

/** === API: получить правила ребёнка (owner-only) === */
export const getChildSpendRules = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const ownerUid = req.auth?.uid;
    if (!ownerUid) throw new HttpsError("unauthenticated", "Auth required");
    const { targetUid } = req.data as { targetUid: string };

    const { famRef, fam } = await getFamilyContext(ownerUid);
    if (fam.ownerUid !== ownerUid)
      throw new HttpsError("permission-denied", "Only owner");

    const snap = await famRef.collection("members").doc(targetUid).get();
    return { ok: true, rules: snap.data() || {} };
  },
);

/** === CRON: ежедневно проверять возраст → 14 лет = окончание кастодии === */
export const dailyCheckCustodialUpgrades = onSchedule(
  { region: "us-east1", schedule: "0 4 * * *" },
  async () => {
    const db = admin.firestore();
    const fams = await db.collection("families").get();
    for (const f of fams.docs) {
      const mems = await f.ref.collection("members").get();
      for (const m of mems.docs) {
        const d = m.data();
        if (!d?.dob) continue;
        const age = computeAge(d.dob);
        if (age >= 14 && d?.custodial) {
          await m.ref.set(
            {
              custodial: false,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      }
    }
  },
);


export const custodySetRules = onCall(async (req) => {
  const { familyId, rules } = req.data ?? {};
  if (!familyId) throw new HttpsError("invalid-argument", "familyId required");
  return { ok: true };
});

export const custodyApproveTx = onCall(async (req) => {
  const { txId } = req.data ?? {};
  if (!txId) throw new HttpsError("invalid-argument", "txId required");
  return { ok: true };
});

// Алиасы

