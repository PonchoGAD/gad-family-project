import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { US_REGIONS } from "../config";

async function assertFamilyAndMember(uid: string) {
  const db = admin.firestore();
  const uDoc = await db.collection("users").doc(uid).get();
  const familyId = uDoc.data()?.familyId as string | undefined;
  if (!familyId) throw new HttpsError("failed-precondition", "Join family first");

  const mDoc = await db.collection("families").doc(familyId).collection("members").doc(uid).get();
  if (!mDoc.exists) throw new HttpsError("failed-precondition", "Member record not found");

  return { db, familyId };
}

export const proposeOwner = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const actor = req.auth?.uid;
    if (!actor) throw new HttpsError("unauthenticated", "Auth required");
    const { candidateUid } = req.data as { candidateUid: string };

    const { db, familyId } = await assertFamilyAndMember(actor);
    const cand = await db.collection("families").doc(familyId).collection("members").doc(candidateUid).get();
    if (!cand.exists) throw new HttpsError("not-found", "Candidate not in family");
    const cData = cand.data() as { age?: number } | undefined;
    if ((cData?.age ?? 0) < 14) throw new HttpsError("failed-precondition", "Candidate must be 14+");

    const eid = db.collection("families").doc(familyId).collection("elections").doc().id;

    await db.collection("families").doc(familyId).collection("elections").doc(eid).set({
      candidateUid,
      createdBy: actor,
      status: "open",
      endsAt: null,
    });
    await db.collection("families").doc(familyId).collection("elections").doc(eid)
      .collection("votes").doc(actor).set({
        choice: true,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { ok: true, eid };
  },
);

export const finalizeOwner = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const actor = req.auth?.uid;
    if (!actor) throw new HttpsError("unauthenticated", "Auth required");
    const { eid } = req.data as { eid: string };

    const { db, familyId } = await assertFamilyAndMember(actor);
    const famRef = db.collection("families").doc(familyId);
    const eRef = famRef.collection("elections").doc(eid);
    const eDoc = await eRef.get();
    if (!eDoc.exists) throw new HttpsError("not-found", "Election not found");
    const e = eDoc.data() || null;
    if (!e || e.status !== "open") throw new HttpsError("failed-precondition", "Already finalized");

    const votesSnap = await eRef.collection("votes").get();
    let yes = 0;
    votesSnap.forEach((v: FirebaseFirestore.QueryDocumentSnapshot) => {
      if ((v.data() as any).choice) yes++;
    });

    const membersSnap = await famRef.collection("members").get();
    const membersCount = membersSnap.size;
    const pass = yes > membersCount / 2;

    if (pass) {
      const candidateUid = (e as any).candidateUid as string;
      const cand = await famRef.collection("members").doc(candidateUid).get();
      const cd = cand.data() || null;
      if (!cand.exists || !cd || ((cd as any).age ?? 0) < 14) {
        throw new HttpsError("failed-precondition", "Candidate < 14 (invalid)");
      }
      await famRef.set({ ownerUid: candidateUid }, { merge: true });
    }

    await eRef.set({ status: "finalized" }, { merge: true });

    return { ok: true, pass };
  },
);

export const getDistributionHistory = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const actor = req.auth?.uid;
    if (!actor) throw new HttpsError("unauthenticated", "Auth required");

    const { db, familyId } = await assertFamilyAndMember(actor);
    const snap = await db.collection("families").doc(familyId).collection("distributions")
      .orderBy("at", "desc").limit(50).get();

    const items = snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({
      id: d.id,
      ...(d.data() as any),
    }));
    return { ok: true, items };
  },
);

// === совместимость с mobile v1 ===

import { getFirestore } from "firebase-admin/firestore";
import { nanoid } from "nanoid";

export const createFamily = onCall(async (req) => {
  const { name } = req.data ?? {};
  if (!name) throw new HttpsError("invalid-argument", "Missing family name");
  const db = getFirestore();
  const id = "fam_" + nanoid(10);
  await db.collection("families").doc(id).set({
    id, name, createdAt: Date.now(), ownerUid: req.auth?.uid ?? null,
  });
  return { ok: true, id };
});

export const joinFamilyByCode = onCall(async (req) => {
  const { code } = req.data ?? {};
  if (!code) throw new HttpsError("invalid-argument", "Missing invite code");
  // TODO: lookup by code
  return { ok: true, familyId: "fam_mock" };
});

export const getFamilySummary = onCall(async (req) => {
  const { familyId } = req.data ?? {};
  if (!familyId) throw new HttpsError("invalid-argument", "Missing familyId");
  // TODO: read summary from Firestore
  return { ok: true, summary: { familyId, members: [], treasury: { balance: 0 } } };
});

export const shareInviteLink = onCall(async (req) => {
  const { familyId } = req.data ?? {};
  if (!familyId) throw new HttpsError("invalid-argument", "Missing familyId");
  const url = `https://gad.family/invite/${familyId}`;
  return { ok: true, url };
});

// Алиасы для совместимости
export { createFamily as createFamilyCallable };
export { joinFamilyByCode as joinFamilyByCodeCallable };
export { getFamilySummary as getFamilySummaryCallable };
export { shareInviteLink as shareInviteLinkCallable };
