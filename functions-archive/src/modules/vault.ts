// functions-app/src/modules/vault.ts

import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { CALLABLE_OPTS, US_REGIONS } from "../config.js";

/** === Общие типы/константы модуля сейфа === */
const CURRENCIES = ["GAD", "BNB", "USDT"] as const;
type Currency = (typeof CURRENCIES)[number];
function isCurrency(x: any): x is Currency {
  return CURRENCIES.includes(x);
}

/** === helpers: контекст семьи/инициализация сейфа/журнал === */
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

async function ensureVaultDoc(
  famRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
) {
  // doc id = "vault" внутри корня семьи (оставляю структуру как у тебя)
  const v = await famRef.collection("").doc("vault").get();
  if (!v.exists) {
    await famRef
      .collection("")
      .doc("vault")
      .set({
        balances: { GAD: 0, BNB: 0, USDT: 0 },
        frozen: { GAD: 0, BNB: 0, USDT: 0 },
        policy: { ownerPct: 80, participantsPct: 20, fundsPct: {} },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }
}

async function writeVaultLedger(
  db: FirebaseFirestore.Firestore,
  fid: string,
  actorUid: string,
  action: string,
  details: any,
) {
  await db.collection("families").doc(fid).collection("ledger").add({
    action,
    actorUid,
    details,
    at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** === Политика распределения сейфа === */
export const setVaultPolicy = onCall(CALLABLE_OPTS, async (req) => {
  const actor = req.auth?.uid;
  if (!actor) throw new HttpsError("unauthenticated", "Auth required");
  const { ownerPct, participantsPct, fundsPct } = req.data as {
    ownerPct: number;
    participantsPct: number;
    fundsPct?: { [k: string]: number };
  };

  if (ownerPct < 0 || participantsPct < 0)
    throw new HttpsError("invalid-argument", "bad percents");
  const sum =
    ownerPct +
    participantsPct +
    Object.values(fundsPct ?? {}).reduce((a, b) => a + b, 0);
  if (Math.round(sum) !== 100)
    throw new HttpsError("invalid-argument", "Percents must sum to 100");

  const { db, fid, famRef, fam } = await getFamilyContext(actor);
  if (fam.ownerUid !== actor)
    throw new HttpsError("permission-denied", "Only owner can change policy");

  await ensureVaultDoc(famRef);
  await famRef
    .collection("")
    .doc("vault")
    .set(
      {
        policy: { ownerPct, participantsPct, fundsPct: fundsPct ?? {} },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  await writeVaultLedger(db, fid, actor, "setVaultPolicy", {
    ownerPct,
    participantsPct,
    fundsPct,
  });
  return { ok: true };
});

/** === Триггер распределения доходов сейфа === */
export const onVaultIncome = onDocumentCreated(
  // важно: здесь регион — строка (не массив), чтобы не ловить TS2322
  { region: US_REGIONS[0] as string, document: "families/{fid}/vaultIncomes/{iid}" },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { fid } = event.params as { fid: string };
    const db = admin.firestore();
    const famRef = db.collection("families").doc(fid);

    await ensureVaultDoc(famRef);
    const vDoc = await famRef.collection("").doc("vault").get();
    const policy = vDoc.data()?.policy ?? {
      ownerPct: 80,
      participantsPct: 20,
      fundsPct: {},
    };

    const currency: Currency = data.currency;
    const total: number = data.amount;
    const fam = (await famRef.get()).data();
    const ownerUid: string = fam?.ownerUid;

    const fundsPct = policy.fundsPct ?? {};
    const fundsAlloc: Record<string, number> = {};
    let fundsTotal = 0;
    for (const [k, p] of Object.entries(fundsPct)) {
      const val = Math.floor((total * (p as number)) / 100);
      if (val > 0) {
        fundsAlloc[k] = val;
        fundsTotal += val;
      }
    }

    const remainder = total - fundsTotal;
    const ownerShare = Math.floor((remainder * policy.ownerPct) / 100);
    const participantsShareTotal = remainder - ownerShare;

    const membersSnap = await famRef.collection("members").get();
    const memberUids: string[] = [];
    membersSnap.forEach((d) => memberUids.push(d.id));
    const others = memberUids.filter((u) => u !== ownerUid);
    const perOther =
      others.length > 0
        ? Math.floor(participantsShareTotal / others.length)
        : 0;

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const didRef = famRef.collection("vaultDistributions").doc();
    const perMemberEntries = Object.fromEntries([
      [ownerUid, ownerShare],
      ...others.map((u) => [u, perOther]),
    ]);

    batch.set(didRef, {
      incomeRef: event.data?.ref,
      currency,
      total,
      ownerUid,
      ownerShare,
      participantsShareTotal,
      perMember: perMemberEntries,
      funds: fundsAlloc,
      initiatedBy: "system:auto",
      at: now,
    });

    // allocated per member
    const allocInc = (uid: string, amt: number) => {
      const mRef = famRef.collection("vaultMembers").doc(uid);
      batch.set(
        mRef,
        {
          allocated: { [currency]: admin.firestore.FieldValue.increment(amt) },
          updatedAt: now,
        },
        { merge: true },
      );
    };
    if (ownerUid) allocInc(ownerUid, ownerShare);
    others.forEach((u) => allocInc(u, perOther));

    const vRef = famRef.collection("").doc("vault");
    if (fundsTotal > 0) {
      batch.set(
        vRef,
        {
          frozen: {
            [currency]: admin.firestore.FieldValue.increment(fundsTotal),
          },
          updatedAt: now,
        },
        { merge: true },
      );
    }

    await batch.commit();
    await writeVaultLedger(db, fid, "system:auto", "autoDistribute", {
      incomeId: event.params["iid"],
      currency,
      total,
      ownerShare,
      perOther,
      fundsAlloc,
    });
  },
);

/** === Перевод между балансом и фризом сейфа (freeze/unfreeze) === */
export const freezeFunds = onCall(CALLABLE_OPTS, async (req) => {
  const actor = req.auth?.uid;
  if (!actor) throw new HttpsError("unauthenticated", "Auth required");
  const { currency, amount, direction } = req.data as {
    currency: Currency;
    amount: number;
    direction: "freeze" | "unfreeze";
  };
  if (!isCurrency(currency))
    throw new HttpsError("invalid-argument", "invalid currency");
  if (amount <= 0)
    throw new HttpsError("invalid-argument", "amount > 0 required");

  const { db, fid, famRef, fam } = await getFamilyContext(actor);
  if (fam.ownerUid !== actor)
    throw new HttpsError("permission-denied", "Only owner");

  await ensureVaultDoc(famRef);
  const vRef = famRef.collection("").doc("vault");
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (direction === "freeze") {
    await vRef.set(
      {
        balances: {
          [currency]: admin.firestore.FieldValue.increment(-amount),
        },
        frozen: { [currency]: admin.firestore.FieldValue.increment(+amount) },
        updatedAt: now,
      },
      { merge: true },
    );
  } else {
    await vRef.set(
      {
        balances: {
          [currency]: admin.firestore.FieldValue.increment(+amount),
        },
        frozen: { [currency]: admin.firestore.FieldValue.increment(-amount) },
        updatedAt: now,
      },
      { merge: true },
    );
  }

  await writeVaultLedger(db, fid, actor, direction, { currency, amount });
  return { ok: true };
});

/** === Статус сейфа (балансы/политика/участники) === */
export const getVaultStatus = onCall(CALLABLE_OPTS, async (req) => {
  const actor = req.auth?.uid;
  if (!actor) throw new HttpsError("unauthenticated", "Auth required");
  const { famRef } = await getFamilyContext(actor);
  await ensureVaultDoc(famRef);

  const v = (await famRef.collection("").doc("vault").get()).data();
  const membersSnap = await famRef.collection("vaultMembers").get();
  const members = membersSnap.docs.map((d) => ({
    uid: d.id,
    ...(d.data() as any),
  }));

  return { ok: true, vault: v, members };
});

/** === История сейфа (incomes/distributions) === */
export const getVaultHistory = onCall(CALLABLE_OPTS, async (req) => {
  const actor = req.auth?.uid;
  if (!actor) throw new HttpsError("unauthenticated", "Auth required");
  const { famRef } = await getFamilyContext(actor);

  const incSnap = await famRef
    .collection("vaultIncomes")
    .orderBy("at", "desc")
    .limit(50)
    .get();
  const distSnap = await famRef
    .collection("vaultDistributions")
    .orderBy("at", "desc")
    .limit(50)
    .get();

  const incomes = incSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  }));
  const dists = distSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  }));

  return { ok: true, incomes, distributions: dists };
});

/** === Простые mock-функции пополнения/вывода (оставляю интерфейс как был) === */
export const depositToVault = onCall(CALLABLE_OPTS, async (req) => {
  const { familyId, amount } = req.data ?? {};
  if (!familyId || typeof amount !== "number")
    throw new HttpsError("invalid-argument", "familyId & amount required");
  // TODO: write deposit record
  return { ok: true, txId: "tx_dep_mock" };
});

export const withdrawFromVault = onCall(CALLABLE_OPTS, async (req) => {
  const { familyId, amount } = req.data ?? {};
  if (!familyId || typeof amount !== "number")
    throw new HttpsError("invalid-argument", "familyId & amount required");
  // TODO: write withdrawal record
  return { ok: true, txId: "tx_wd_mock" };
});

/** === Алиасы для совместимости с mobileV1 === */
export {
  depositToVault as depositToVaultCallable,
  withdrawFromVault as withdrawFromVaultCallable,
  getVaultHistory as getVaultHistoryCallable,
};
