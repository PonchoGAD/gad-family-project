// functions/src/funds.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Firestore structure:
 *
 * users/{uid}/funds/{fundId}:
 * {
 *   name,
 *   token,
 *   targetAmount,
 *   amount,
 *   unlockDate,
 *   status: "active" | "completed" | "withdrawn",
 *   createdAt
 * }
 *
 * balances/{uid}.pointsTotal — main points account
 */

export const createFund = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");

  const { name, targetAmount, token } = req.data || {};

  if (!name || !targetAmount) {
    throw new HttpsError("invalid-argument", "name & targetAmount required");
  }

  const db = admin.firestore();
  const fundRef = db.collection(`users/${uid}/funds`).doc();

  const unlockDate =
    Date.now() + 90 * 24 * 60 * 60 * 1000; // MVP: 90 days lock

  await fundRef.set({
    name,
    token: token ?? "points",
    targetAmount,
    amount: 0,
    unlockDate,
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, fundId: fundRef.id };
});

export const depositToFund = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");

  const { fundId, amount } = req.data || {};

  if (!fundId || !amount || amount <= 0) {
    throw new HttpsError("invalid-argument", "fundId & amount required");
  }

  const db = admin.firestore();
  const fundRef = db.doc(`users/${uid}/funds/${fundId}`);
  const balRef = db.doc(`balances/${uid}`);

  await db.runTransaction(async (tx) => {
    const fundSnap = await tx.get(fundRef);
    if (!fundSnap.exists) throw new HttpsError("not-found", "Fund missing");

    const fund = fundSnap.data() as any;

    const balSnap = await tx.get(balRef);
    const points = balSnap.data()?.pointsTotal ?? 0;

    if (points < amount) {
      throw new HttpsError("failed-precondition", "Not enough points");
    }

    tx.set(
      balRef,
      { pointsTotal: points - amount },
      { merge: true }
    );

    tx.set(
      fundRef,
      {
        amount: (fund.amount ?? 0) + amount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { ok: true };
});

export const withdrawFund = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");

  const { fundId } = req.data || {};
  if (!fundId)
    throw new HttpsError("invalid-argument", "fundId required");

  const db = admin.firestore();
  const fundRef = db.doc(`users/${uid}/funds/${fundId}`);
  const balRef = db.doc(`balances/${uid}`);

  await db.runTransaction(async (tx) => {
    const fundSnap = await tx.get(fundRef);
    if (!fundSnap.exists) throw new HttpsError("not-found", "Fund missing");

    const fund = fundSnap.data() as any;

    const now = Date.now();
    if (now < fund.unlockDate) {
      throw new HttpsError("failed-precondition", "Fund locked");
    }

    if (fund.status !== "active") {
      throw new HttpsError("failed-precondition", "Already withdrawn or closed");
    }

    // return amount to balance
    const balSnap = await tx.get(balRef);
    const points = balSnap.data()?.pointsTotal ?? 0;

    tx.set(
      balRef,
      { pointsTotal: points + (fund.amount ?? 0) },
      { merge: true }
    );

    tx.set(
      fundRef,
      {
        status: "withdrawn",
        withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { ok: true };
});
