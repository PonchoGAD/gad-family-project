// apps/mobile/src/lib/geo.ts
import { db, auth } from "../firebase";
import {
  doc,
  getDoc,
  collectionGroup,
  getDocs,
  setDoc,
  serverTimestamp,
  collection,
} from "firebase/firestore";

export type GeoPoint = {
  uid: string;
  lat: number;
  lng: number;
  ts?: number;
};

export type FamilyPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // meters
};

/**
 * Returns familyId of current user.
 */
export async function getFamilyId(): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return (snap.data()?.familyId as string) ?? null;
}

/**
 * Loads ALL last geo points:
 * geo/{uid}/meta/last
 */
export async function loadGeoPoints(): Promise<GeoPoint[]> {
  const snap = await getDocs(collectionGroup(db, "meta"));
  const arr: GeoPoint[] = [];

  snap.forEach((d) => {
    if (d.id !== "last") return;
    const v = d.data() as any;
    if (typeof v.lat !== "number" || typeof v.lng !== "number") return;

    const parts = d.ref.path.split("/");
    const uid = parts[1];

    arr.push({
      uid,
      lat: v.lat,
      lng: v.lng,
      ts: v.ts,
    });
  });

  return arr;
}

/**
 * Loads family places (home, school, work, etc.)
 */
export async function loadFamilyPlaces(fid: string): Promise<FamilyPlace[]> {
  const placesColl = collection(db, "families", fid, "places");
  const snap = await getDocs(placesColl);

  const res: FamilyPlace[] = snap.docs.map((d) => {
    const v = d.data() as any;
    return {
      id: d.id,
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      radius: v.radius ?? 150,
    };
  });
  return res;
}

/**
 * Compute distance between two coordinates (Haversine)
 */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Check if inside geofence
 */
export function insideGeofence(point: GeoPoint, place: FamilyPlace): boolean {
  const dist = distanceM(point.lat, point.lng, place.lat, place.lng);
  return dist <= place.radius;
}

/**
 * Write geoState: “home” | “away”
 */
export async function writeGeoState(
  fid: string,
  uid: string,
  state: "home" | "away",
  placeId?: string
) {
  await setDoc(
    doc(db, "families", fid, "geoState", uid),
    {
      state,
      placeId: placeId ?? null,
      changedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
