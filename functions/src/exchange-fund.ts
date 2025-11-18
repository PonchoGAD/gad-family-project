// functions/src/exchange-fund.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Return monthly limits for user (simple static MVP)
 */
export const getExchangeLimits = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");

  return {
    maxUsd: 500,
    maxGad: 500_000,
  };
});

/**
 * Create exchange request (GAD → USDT)
 */
export const requestExchange = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");

  const { gad, address } = req.data || {};

  if (!gad || gad <= 0)
    throw new HttpsError("invalid-argument", "gad is required");

  const db = admin.firestore();

  // redemptions
  const col = db.collection("redemptions").doc(uid).collection("items");
  const ref = col.doc();

  await ref.set({
    type: "usdt",
    status: "pending",
    gad,
    address,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
