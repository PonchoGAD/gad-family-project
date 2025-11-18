// functions/src/subscriptions.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Subscription tiers:
 * BASIC  → free
 * FAMILY → plus
 * PRO    → pro
 *
 * Firestore:
 * users/{uid}.subscription
 * families/{fid}.subscriptionTier
 * users/{uid}.gasCreditWei
 * gasStipend/{uid}/items/{itemId}
 */

type PlanId = "basic" | "family" | "pro";

type PlanCfg = {
  id: PlanId;
  label: string;
  monthlyGasWei: number;
  maxSteps: number;
  mult: number;
};

const SUBSCRIPTIONS: Record<PlanId, PlanCfg> = {
  basic: {
    id: "basic",
    label: "Basic",
    monthlyGasWei: 0,
    maxSteps: 6000,
    mult: 1.0,
  },
  family: {
    id: "family",
    label: "Family",
    monthlyGasWei: 0.0005 * 1e18,
    maxSteps: 12000,
    mult: 1.25,
  },
  pro: {
    id: "pro",
    label: "Pro",
    monthlyGasWei: 0.001 * 1e18,
    maxSteps: 20000,
    mult: 1.5,
  },
};

// ============================================================================
// setSubscriptionTier
// ============================================================================
export const setSubscriptionTier = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");

  const { tier, fid } = req.data || {};
  if (!tier || !fid) {
    throw new HttpsError("invalid-argument", "tier & fid required");
  }

  const cfg = SUBSCRIPTIONS[tier as PlanId];
  if (!cfg) {
    throw new HttpsError("invalid-argument", "Unknown tier");
  }

  const db = admin.firestore();

  await db.doc(`users/${uid}`).set(
    {
      subscription: tier,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.doc(`families/${fid}`).set(
    {
      subscriptionTier: tier,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, tier };
});

// ============================================================================
// applyGasStipend
// ============================================================================
export const applyGasStipend = onCall(async (req) => {
  const { uid } = req.data || {};
  if (!uid) throw new HttpsError("invalid-argument", "uid required");

  const db = admin.firestore();
  const uref = db.doc(`users/${uid}`);
  const usnap = await uref.get();

  // ✅ В Admin SDK .exists — свойство, а не функция
  if (!usnap.exists) throw new HttpsError("not-found", "User missing");

  const data = usnap.data() as any;
  const tier: PlanId = data.subscription || "basic";

  const cfg = SUBSCRIPTIONS[tier];

  if (!cfg.monthlyGasWei) return { ok: true, skipped: true };

  const creditRef = db.doc(`users/${uid}`);
  const histRef = db.collection(`gasStipend/${uid}/items`).doc();

  await db.runTransaction(async (tx) => {
    const prev = await tx.get(creditRef);
    const prevWei = prev.data()?.gasCreditWei ?? 0;

    tx.set(
      creditRef,
      {
        gasCreditWei: prevWei + cfg.monthlyGasWei,
        gasUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(histRef, {
      amountWei: cfg.monthlyGasWei,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      tier,
    });
  });

  return { ok: true, added: cfg.monthlyGasWei };
});

// ============================================================================
// getSubscriptionConfig
// ============================================================================
export const getSubscriptionConfig = onCall(async () => {
  return { ok: true, plans: SUBSCRIPTIONS };
});
