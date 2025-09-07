import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { US_REGIONS } from "../config";

// ===== helpers =====
async function assertFamilyAndMember(uid: string) {
  const db = admin.firestore();
  const uDoc = await db.collection("users").doc(uid).get();
  const familyId = uDoc.data()?.familyId as string | undefined;
  if (!familyId) throw new HttpsError("failed-precondition", "Join family first");
  const mDoc = await db.collection("families").doc(familyId).collection("members").doc(uid).get();
  if (!mDoc.exists) throw new HttpsError("failed-precondition", "Member record not found");
  const member = mDoc.data();
  if (!member) throw new HttpsError("failed-precondition", "Member record not found");
  return { db, familyId, member };
}

async function writeLedger(
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
// ===================

export const proposeOwner = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const actor = req.auth?.uid;
    if (!actor) throw new HttpsError("unauthenticated", "Auth required");
    const { candidateUid, endsAtISO } = req.data as { candidateUid: string; endsAtISO?: string };

    const { db, familyId } = await assertFamilyAndMember(actor);
    if (!candidateUid) throw new HttpsError("invalid-argument", "candidateUid required");

    const cand = await db.collection("families").doc(familyId).collection("members").doc(candidateUid).get();
    if (!cand.exists) throw new HttpsError("not-found", "Candidate not in family");

    const cData = cand.data() as { age?: number } | undefined;
    if (!cData) throw new HttpsError("failed-precondition", "Candidate data missing");
    if ((cData.age ?? 0) < 14) throw new HttpsError("failed-precondition", "Candidate must be 14+");

    const eid = db.collection("families").doc(familyId).collection("elections").doc().id;
    const endsAt = endsAtISO ? new Date(endsAtISO) : null;

    await db.collection("families").doc(familyId).collection("elections").doc(eid).set({
      candidateUid,
      createdBy: actor,
      status: "open",
      endsAt: endsAt ? admin.firestore.Timestamp.fromDate(endsAt) : null,
    });

    await db.collection("families").doc(familyId).collection("elections").doc(eid)
      .collection("votes").doc(actor).set({
        choice: true,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });

    await writeLedger(db, familyId, actor, "proposeOwner", { eid, candidateUid });
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
    votesSnap.forEach((v) => { if (v.data().choice) yes++; });

    const membersSnap = await famRef.collection("members").get();
    const membersCount = membersSnap.size;
    const pass = yes > membersCount / 2;

    if (pass) {
      // фикс опечатки из исходника: candidateuid → candidateUid
      const candidateUid = (e as any).candidateUid as string;
      const cand = await famRef.collection("members").doc(candidateUid).get();
      const cd = cand.data() || null;
      if (!cand.exists || !cd || (cd.age ?? 0) < 14) {
        throw new HttpsError("failed-precondition", "Candidate < 14 (invalid)");
      }
      await famRef.set({ ownerUid: candidateUid }, { merge: true });
    }
    await eRef.set({ status: "finalized" }, { merge: true });
    await writeLedger(db, familyId, actor, "finalizeOwner", { eid, pass, yes, membersCount });

    return { ok: true, pass };
  },
);

export const setOwnerManual = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const actor = req.auth?.uid;
    if (!actor) throw new HttpsError("unauthenticated", "Auth required");
    const { targetUid } = req.data as { targetUid: string };

    const { db, familyId } = await assertFamilyAndMember(actor);
    const famSnap = await db.collection("families").doc(familyId).get();
    const fam = famSnap.data() || {};
    const isOwner = fam.ownerUid === actor;

    const ADMINS = (process.env.ADMINS_UID_CSV || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const isAdmin = ADMINS.includes(actor);

    if (!isOwner && !isAdmin)
      throw new HttpsError("permission-denied", "Only family owner or admin");

    const cand = await db.collection("families").doc(familyId).collection("members").doc(targetUid).get();
    const data = cand.data() || null;
    if (!cand.exists || (data?.age ?? 0) < 14) {
      throw new HttpsError("failed-precondition", "Target must be and family member");
    }

    await db.collection("families").doc(familyId).set({ ownerUid: targetUid }, { merge: true });
    await writeLedger(db, familyId, actor, "setOwnerManual", { targetUid });

    return { ok: true };
  },
);
