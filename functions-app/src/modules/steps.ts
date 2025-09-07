import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { US_REGIONS } from "../config";

export const submitDailySteps = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");

    const { date, steps, source } = req.data as {
      date: string;
      steps: number;
      source: "device" | "healthkit" | "googlefit";
    };
    if (!date || typeof steps !== "number")
      throw new HttpsError("invalid-argument", "date/steps required");

    const db = admin.firestore();
    const user = (await db.collection("users").doc(uid).get()).data();
    if (!user?.familyId) throw new HttpsError("failed-precondition", "Join family first");

    const stepToPoint = 1000;
    const dailyCap = 10000;
    const points = Math.min(Math.floor(steps / stepToPoint), dailyCap);

    await db.collection("dailySteps").doc(uid).collection("").doc(date).set(
      {
        steps,
        source,
        verified: source !== "device",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await db.collection("earnings").doc(uid).collection("").doc(date).set({
      steps,
      pointsAwarded: points,
      reason: "daily",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, points };
  },
);
