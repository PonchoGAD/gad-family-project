import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { US_REGIONS } from "../config";

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
async function pushTo(tokens: string[], title: string, body: string, data: any = {}) {
  if (!tokens?.length) return;
  try {
    await admin.messaging().sendEachForMulticast({ tokens, notification: { title, body }, data });
  } catch (e) {
    console.error("pushTo error:", e);
  }
}

/** ===== types ===== */
type Interest = "sports" | "arts" | "travel" | "education" | "games" | "books" | "outdoors";
type Language = "en" | "ru" | "es" | "de" | "fr" | "zh";
type AgeBand = "0_3" | "4_6" | "7_12" | "13_17";
type ActivityLevel = "rare" | "monthly" | "weekly";
interface DiscoveryProfile {
  nickname: string;
  city: string;
  interests: Interest[];
  preferredActivities: string[];
  ageBands: AgeBand[];
  hasInfantsNoPhones: boolean;
  langs: Language[];
  activityLevel: ActivityLevel;
  showKids: boolean;
  showAges: boolean;
  showMedia: boolean;
  updatedAt: FirebaseFirestore.FieldValue;
}

/** ===== API: toggle discovery ===== */
export const toggleFamilyDiscovery = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { enabled } = req.data as { enabled: boolean };
    const { db, fid, famRef, fam } = await getFamilyContext(uid);
    if (fam.ownerUid !== uid) throw new HttpsError("permission-denied", "Only owner can toggle");
    await famRef.set({ discoveryEnabled: !!enabled }, { merge: true });
    await db.collection("families").doc(fid).collection("ledger").add({
      action: "discoveryToggle", actorUid: uid, details: { enabled }, at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, enabled: !!enabled };
  },
);

/** ===== API: set discovery profile ===== */
export const setDiscoveryProfile = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const {
      nickname, city, interests, preferredActivities, ageBands,
      hasInfantsNoPhones, langs, activityLevel, showKids, showAges, showMedia,
    } = req.data as Partial<DiscoveryProfile>;

    const { db, fid, famRef, fam } = await getFamilyContext(uid);
    if (fam.ownerUid !== uid) throw new HttpsError("permission-denied", "Only owner can edit profile");

    const profile: Partial<DiscoveryProfile> = {
      ...(nickname ? { nickname } : {}),
      ...(city ? { city } : {}),
      ...(Array.isArray(interests) ? { interests } : {}),
      ...(Array.isArray(preferredActivities) ? { preferredActivities } : {}),
      ...(Array.isArray(ageBands) ? { ageBands } : {}),
      ...(typeof hasInfantsNoPhones === "boolean" ? { hasInfantsNoPhones } : {}),
      ...(Array.isArray(langs) ? { langs } : {}),
      ...(activityLevel ? { activityLevel } : {}),
      ...(typeof showKids === "boolean" ? { showKids } : {}),
      ...(typeof showAges === "boolean" ? { showAges } : {}),
      ...(typeof showMedia === "boolean" ? { showMedia } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await famRef.collection("discovery").doc("profile").set(profile, { merge: true });
    await db.collection("families").doc(fid).collection("ledger").add({
      action: "discoveryProfileSet", actorUid: uid, details: profile, at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true };
  },
);

/** ===== API: search families ===== */
export const searchFamilies = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { city, interests, ageBands, langs, limit } = (req.data ?? {}) as {
      city?: string; interests?: Interest[]; ageBands?: AgeBand[]; langs?: Language[]; limit?: number;
    };

    const { db, fid } = await getFamilyContext(uid);
    const famSnap = await db.collection("families").where("discoveryEnabled", "==", true).limit(200).get();

    const results: any[] = [];
    for (const f of famSnap.docs) {
      const otherFid = f.id; if (otherFid === fid) continue;
      const prof = (await db.collection("families").doc(otherFid).collection("discovery").doc("profile").get()).data() as Partial<DiscoveryProfile> | undefined;
      if (!prof) continue;
      if (city && prof.city && prof.city.toLowerCase() !== city.toLowerCase()) continue;

      const interestMatch =
        !interests || !interests.length ||
        (Array.isArray(prof.interests) && prof.interests.some((x) => interests.includes(x as Interest)));

      const ageMatch =
        !ageBands || !ageBands.length ||
        (Array.isArray(prof.ageBands) && prof.ageBands.some((x) => ageBands.includes(x as AgeBand)));

      const langMatch =
        !langs || !langs.length ||
        (Array.isArray(prof.langs) && prof.langs.some((x) => langs.includes(x as Language)));

      if (interestMatch && ageMatch && langMatch) {
        results.push({
          fid: otherFid,
          nickname: prof.nickname ?? "Family",
          city: prof.city ?? "",
          interests: prof.interests ?? [],
          ageBands: prof.ageBands ?? [],
          langs: prof.langs ?? [],
          activityLevel: prof.activityLevel ?? "monthly",
        });
      }
    }
    results.sort((a, b) => (b.interests?.length ?? 0) - (a.interests?.length ?? 0));
    return { ok: true, items: results.slice(0, Math.min(limit ?? 50, 100)) };
  },
);

/** ===== API: friend requests ===== */
export const sendFriendRequest = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { targetFid } = req.data as { targetFid: string };
    const { db, fid } = await getFamilyContext(uid);
    if (!targetFid) throw new HttpsError("invalid-argument", "targetFid");

    const myMember = await db.collection("families").doc(fid).collection("members").doc(uid).get();
    if (!myMember.exists || !(myMember.data()?.isAdult === true))
      throw new HttpsError("permission-denied", "Only adults can send");

    const reqRef = await db.collection("families").doc(targetFid).collection("friendRequests").add({
      fromFid: fid, fromUid: uid, status: "pending", at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const tf = await db.collection("families").doc(targetFid).get();
    const ownerUid = tf.data()?.ownerUid as string | undefined;
    if (ownerUid) {
      const ownerUser = await db.collection("users").doc(ownerUid).get();
      const tokens: string[] = ownerUser.data()?.fcmTokens ?? [];
      await pushTo(tokens, "Friend request", "You have a new family request", { kind: "friend_request", rid: reqRef.id });
    }

    return { ok: true, rid: reqRef.id };
  },
);

export const respondFriendRequest = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { rid, accept } = req.data as { rid: string; accept: boolean };
    const { db, fid } = await getFamilyContext(uid);

    const fam = await db.collection("families").doc(fid).get();
    const isOwner = fam.data()?.ownerUid === uid;
    const isAdult = (await db.collection("families").doc(fid).collection("members").doc(uid).get()).data()?.isAdult;
    if (!isOwner && !isAdult) throw new HttpsError("permission-denied", "Only owner/adult");

    const r = await db.collection("families").doc(fid).collection("friendRequests").doc(rid).get();
    if (!r.exists) throw new HttpsError("not-found", "request");

    await r.ref.set({
      status: accept ? "accepted" : "rejected",
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (accept) {
      const fromFid = r.data()?.fromFid as string;
      await db.collection("families").doc(fid).collection("friends").doc(fromFid).set({ since: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection("families").doc(fromFid).collection("friends").doc(fid).set({ since: admin.firestore.FieldValue.serverTimestamp() });
    }
    return { ok: true };
  },
);

export const reportOrBlockFamily = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { targetFid, reason, block } = req.data as { targetFid: string; reason?: string; block?: boolean };
    const { db, fid } = await getFamilyContext(uid);

    await db.collection("families").doc(fid).collection("abuse").add({
      targetFid, reason: reason ?? null, block: !!block, at: admin.firestore.FieldValue.serverTimestamp(), byUid: uid,
    });

    if (block) {
      await db.collection("families").doc(fid).collection("blocked").doc(targetFid).set({ at: admin.firestore.FieldValue.serverTimestamp() });
    }
    return { ok: true };
  },
);
