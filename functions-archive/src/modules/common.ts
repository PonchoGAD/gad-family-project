import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

export const db = admin.firestore();

/** ===== Shared helpers (были разбросаны по старому index.ts) ===== */
export async function familyOf(uid: string) {
  const u = await db.collection("users").doc(uid).get();
  const familyId = u.data()?.familyId as string | undefined;
  if (!familyId) throw new HttpsError("failed-precondition", "Join family first");
  return familyId;
}

export async function getFamilyContext(uid: string) {
  const fid = await familyOf(uid);
  const famRef = db.collection("families").doc(fid);
  const fam = (await famRef.get()).data();
  if (!fam) throw new HttpsError("not-found", "Family not found");
  return { db, fid, famRef, fam };
}

export async function assertFamilyAndMember(uid: string) {
  const { fid } = await getFamilyContext(uid);
  const mDoc = await db.collection("families").doc(fid).collection("members").doc(uid).get();
  if (!mDoc.exists) throw new HttpsError("failed-precondition", "Member record not found");
  return { db, familyId: fid, member: mDoc.data() };
}

export function computeAge(dobISO: string) {
  const dob = new Date(dobISO + "T00:00:00Z");
  const today = new Date();
  const years = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  const d = today.getUTCDate() - dob.getUTCDate();
  return years - (m < 0 || (m === 0 && d < 0) ? 1 : 0);
}

export function haversineM(a: {lat:number; lng:number}, b:{lat:number; lng:number}) {
  const R = 6371000;
  const toRad = (x:number)=> (x*Math.PI)/180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

export async function writeLedger(
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

export async function pushTo(tokens: string[], title: string, body: string, data: any = {}) {
  if (!tokens?.length) return;
  try {
    await admin.messaging().sendEachForMulticast({ tokens, notification: { title, body }, data });
  } catch (e) {
    console.error("pushTo error:", e);
  }
}
