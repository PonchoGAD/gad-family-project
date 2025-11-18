// functions/src/geo.ts
import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

type GeoRecord = {
  uid: string;
  lat: number;
  lng: number;
  ts: number;
  fid: string | null;
};

function distMeters(a: any, b: any) {
  const R = 6371000;
  const toRad = (x: number) => x * Math.PI / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Periodic geofence check
 */
export const geoCheck = onSchedule(
  {
    schedule: "*/3 * * * *", // каждые 3 минуты
    timeZone: "America/New_York",
  },
  async () => {
    const db = admin.firestore();

    const lastSnap = await db.collectionGroup("meta").get();
    const recs: GeoRecord[] = [];

    for (const d of lastSnap.docs) {
      if (d.id !== "last") continue;
      const parts = d.ref.path.split("/");
      const uid = parts[1];

      const userDoc = await db.doc(`users/${uid}`).get();
      const fid = (userDoc.data()?.familyId as string) ?? null;

      const v = d.data() as any;
      if (typeof v.lat !== "number" || typeof v.lng !== "number") continue;

      recs.push({
        uid,
        lat: v.lat,
        lng: v.lng,
        ts: v.ts,
        fid,
      });
    }

    for (const r of recs) {
      if (!r.fid) continue;

      const placesSnap = await db
        .collection(`families/${r.fid}/places`)
        .get();

      for (const p of placesSnap.docs) {
        const place = p.data() as any;
        const dist = distMeters(r, place);

        const stateRef = db.doc(
          `families/${r.fid}/geoState/${r.uid}`
        );

        const stateSnap = await stateRef.get();
        const prev = stateSnap.exists ? stateSnap.data()?.state : "away";

        if (dist <= (place.radius ?? 150)) {
          // inside
          if (prev !== "home") {
            await stateRef.set(
              {
                state: "home",
                placeId: p.id,
                changedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            await db
              .collection(`families/${r.fid}/geoEvents`)
              .add({
                uid: r.uid,
                type: "entered",
                placeId: p.id,
                ts: admin.firestore.FieldValue.serverTimestamp(),
              });

            console.log(`[GEOFENCE] ${r.uid} ENTERED place ${p.id}`);
          }
        } else {
          // outside
          if (prev !== "away") {
            await stateRef.set(
              {
                state: "away",
                placeId: null,
                changedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            await db
              .collection(`families/${r.fid}/geoEvents`)
              .add({
                uid: r.uid,
                type: "left",
                placeId: p.id,
                ts: admin.firestore.FieldValue.serverTimestamp(),
              });

            console.log(`[GEOFENCE] ${r.uid} LEFT place ${p.id}`);
          }
        }
      }
    }
  }
);
