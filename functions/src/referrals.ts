// functions/src/referrals.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { nanoid } from "nanoid";

// Bonus amount
const REFERRAL_BONUS_POINTS = 5000;

// ============================================================================
// Generate referral code
// ============================================================================
export const generateReferralCode = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");

  const db = admin.firestore();
  const uRef = db.doc(`users/${uid}`);
  const snap = await uRef.get();

  // FIX: exists is a property, not a function
  const hasCode =
    snap.exists &&
    typeof snap.data()?.referralCode === "string" &&
    snap.data()!.referralCode.length > 0;

  if (hasCode) {
    return { ok: true, code: snap.data()!.referralCode };
  }

  const code = "GAD-" + nanoid(6).toUpperCase();

  await uRef.set({ referralCode: code }, { merge: true });

  return { ok: true, code };
});

// ============================================================================
// Apply referral bonus
// ============================================================================
export const applyReferralBonus = onCall(async (req) => {
  const { newFamilyId, refCode } = req.data || {};
  if (!newFamilyId || !refCode) {
    throw new HttpsError("invalid-argument", "newFamilyId & refCode required");
  }

  const db = admin.firestore();

  // Find inviter
  const q = await db
    .collection("users")
    .where("referralCode", "==", refCode)
    .limit(1)
    .get();

  if (q.empty) {
    return { ok: false, error: "Unknown referral code" };
  }

  const inviterUid = q.docs[0].id;

  await db.doc(`families/${newFamilyId}`).set(
    {
      referrerUid: inviterUid,
      referredAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const balRef = db.doc(`balances/${inviterUid}`);
  const histRef = db.collection(`referrals/${inviterUid}/items`).doc();

  await db.runTransaction(async (tx) => {
    const prev = await tx.get(balRef);
    const prevPoints = prev.data()?.pointsTotal ?? 0;

    tx.set(
      balRef,
      { pointsTotal: prevPoints + REFERRAL_BONUS_POINTS },
      { merge: true }
    );

    tx.set(histRef, {
      newFamilyId,
      refCode,
      bonusPoints: REFERRAL_BONUS_POINTS,
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, inviterUid, addedPoints: REFERRAL_BONUS_POINTS };
});
