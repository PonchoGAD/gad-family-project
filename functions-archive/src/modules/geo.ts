import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { US_REGIONS } from "../config";

// ===== helpers =====
async function familyOf(uid: string) {
  const db = admin.firestore();
  const u = await db.collection("users").doc(uid).get();
  const data = u.data();
  return data?.familyId as string | undefined;
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// ===================

/** 1) Приём пинга гео */
export const locationPing = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { lat, lng, acc } = req.data as { lat: number; lng: number; acc?: number };
    if (typeof lat !== "number" || typeof lng !== "number")
      throw new HttpsError("invalid-argument", "lat/lng required");

    const fid = await familyOf(uid);
    if (!fid) throw new HttpsError("failed-precondition", "Join family first");

    const db = admin.firestore();
    const memSnap = await db
      .collection("families").doc(fid)
      .collection("members").doc(uid).get();
    const m = memSnap.data();

    // minors: always allowed; adults: need geoEnabled = true
    if (m?.isAdult && !m?.geoEnabled)
      throw new HttpsError("failed-precondition", "Geo disabled by user");

    const now = admin.firestore.FieldValue.serverTimestamp();
    const tsKey = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14); // yyyyMMddHHmmss

    await db.collection("locations").doc("pings").collection(uid).doc(tsKey).set({
      lat, lng, acc: acc ?? null, at: now,
    });
    await db.collection("locations").doc("current").collection("").doc(uid).set(
      { lat, lng, at: now },
      { merge: true },
    );

    return { ok: true };
  },
);

/** 2) Установка/обновление места (дом/школа/кастом) */
export const setPlace = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { placeId, type, title, center, radiusM } = req.data as {
      placeId: string;
      type: "home" | "school" | "custom";
      title: string;
      center: { lat: number; lng: number };
      radiusM: number;
    };

    const fid = await familyOf(uid);
    if (!fid) throw new HttpsError("failed-precondition", "Join family first");

    const fam = await admin.firestore().collection("families").doc(fid).get();
    const isOwner = fam.data()?.ownerUid === uid;
    const mem = await admin.firestore()
      .collection("families").doc(fid)
      .collection("members").doc(uid).get();
    const isAdult = !!mem.data()?.isAdult;

    if (!isOwner && !isAdult)
      throw new HttpsError("permission-denied", "Only owner/adult can set places");

    await admin.firestore()
      .collection("families").doc(fid)
      .collection("places").doc(placeId).set(
        { type, title, center, radiusM },
        { merge: true },
      );

    return { ok: true };
  },
);

/** 3) Триггер: вход/выход в зону места */
export const onLocationPing = onDocumentCreated(
  { region: "us-east4", document: "locations/pings/{uid}/{ts}" },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const uid = event.params.uid as string;

    const fid = await familyOf(uid);
    if (!fid) return;

    const db = admin.firestore();
    const placesSnap = await db.collection("families").doc(fid).collection("places").get();
    if (placesSnap.empty) return;

    const current = { lat: data.lat as number, lng: data.lng as number };

    const stateRef = db.collection("families").doc(fid).collection("geoState").doc(uid);
    const prev = (await stateRef.get()).data() || { inside: {} as Record<string, boolean> };
    const inside: Record<string, boolean> = { ...prev.inside };

    for (const p of placesSnap.docs) {
      const placeId = p.id;
      const place = p.data() as any;
      const dist = haversineM(current, place.center);
      const nowInside = dist <= place.radiusM;

      const wasInside = !!inside[placeId];
      if (nowInside !== wasInside) {
        const type = nowInside ? "enter" : "exit";
        await db.collection("families").doc(fid).collection("geoEvents").add({
          uid,
          placeId,
          type,
          at: admin.firestore.FieldValue.serverTimestamp(),
        });

        const fam = await db.collection("families").doc(fid).get();
        const ownerUid = fam.data()?.ownerUid;
        if (ownerUid) {
          const ownerUser = await db.collection("users").doc(ownerUid).get();
          const tokens: string[] = ownerUser.data()?.fcmTokens ?? ownerUser.data()?.expoTokens ?? [];
          if (tokens.length) {
            await admin.messaging().sendEachForMulticast({
              tokens,
              notification: {
                title: type === "enter" ? "Arrived at place" : "Left place",
                body: `${uid} ${type === "enter" ? "arrived at" : "left"} ${place.title}`,
              },
              data: { kind: "geo", uid, placeId, type },
            });
          }
        }
      }
      inside[placeId] = nowInside;
    }

    await stateRef.set({ inside }, { merge: true });
  },
);

/** 4) История перемещений */
export const getLocationHistory = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { targetUid, fromISO, toISO } = req.data as {
      targetUid: string;
      fromISO: string;
      toISO: string;
    };

    const fid = await familyOf(uid);
    if (!fid) throw new HttpsError("failed-precondition", "Join family first");

    const fam = await admin.firestore().collection("families").doc(fid).get();
    const isOwner = fam.data()?.ownerUid === uid;
    if (!isOwner && uid !== targetUid) {
      const me = await admin.firestore().collection("families").doc(fid).collection("members").doc(uid).get();
      if (!me.data()?.isAdult) throw new HttpsError("permission-denied", "No access");
    }

    const from = new Date(fromISO);
    const to = new Date(toISO);
    if (isNaN(from.getTime()) || isNaN(to.getTime()))
      throw new HttpsError("invalid-argument", "bad date range");

    const pingsRef = admin.firestore().collection("locations").doc("pings").collection(targetUid);
    const snap = await pingsRef.orderBy("at", "desc").limit(5000).get();

    const out: any[] = [];
    snap.forEach((d) => {
      const v = d.data();
      const at = v.at?.toDate?.() ?? new Date();
      if (at >= from && at <= to)
        out.push({ lat: v.lat, lng: v.lng, acc: v.acc ?? null, at: at.toISOString() });
    });

    return { ok: true, items: out.reverse() };
  },
);

/** 5) Ночник: чистка старых пингов (30 дней) */
export const cleanupOldPings = onSchedule(
  { region: "us-east1", schedule: "0 3 * * *" },
  async () => {
    const db = admin.firestore();
    const cutoff = Date.now() - 30 * 86400000;
    const usersSnap = await db.collection("locations").doc("current").collection("").get();
    for (const u of usersSnap.docs) {
      const uid = u.id;
      const pRef = db.collection("locations").doc("pings").collection(uid);
      const last = await pRef.orderBy("at", "asc").limit(1000).get();
      const batch = db.batch();
      last.docs.forEach((doc) => {
        const at = doc.data()?.at?.toMillis?.() ?? 0;
        if (at < cutoff) batch.delete(doc.ref);
      });
      await batch.commit();
    }
  },
);
