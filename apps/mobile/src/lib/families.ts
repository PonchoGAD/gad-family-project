import { auth, db } from "../firebase";
import { nanoid } from "nanoid";
import {
  collection, doc, getDoc, setDoc, serverTimestamp,
  query, where, getDocs, onSnapshot
} from "firebase/firestore";
import * as Linking from "expo-linking";
import { Share } from "react-native"; // <–– добавили

export type FamilyMember = { id: string; joinedAt?: any; lastLocation?: {lat:number, lon:number} };

export async function createFamily(name: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");
  const fid = nanoid(10);
  const inviteCode = nanoid(6).toUpperCase();
  const ref = doc(db, "families", fid);
  await setDoc(ref, { name, ownerUid: uid, inviteCode, createdAt: serverTimestamp() });
  await setDoc(doc(db, "families", fid, "members", uid), { joinedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, "users", uid), { familyId: fid }, { merge: true });
  return { fid, inviteCode };
}

export async function joinFamilyByCode(code: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");
  const q = query(collection(db, "families"), where("inviteCode", "==", code.toUpperCase()));
  const snaps = await getDocs(q);
  if (snaps.empty) throw new Error("Family not found");
  const ref = snaps.docs[0].ref;
  const fid = ref.id;
  await setDoc(doc(db, "families", fid, "members", uid), { joinedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, "users", uid), { familyId: fid }, { merge: true });
  return fid;
}

export async function getFamily(fid: string) {
  const snap = await getDoc(doc(db, "families", fid));
  return snap.exists() ? { id: fid, ...(snap.data() as any) } : null;
}

export function subscribeMembers(
  fid: string,
  cb: (members: FamilyMember[]) => void
){
  const coll = collection(db, "families", fid, "members");
  return onSnapshot(coll, (qs) => {
    const items = qs.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as FamilyMember[];
    cb(items);
  });
}

// уже была:
export function makeInviteLink(inviteCode: string) {
  return Linking.createURL("/join", { queryParams: { code: inviteCode } });
}

// <–– ДОБАВИЛИ: обёртка, чтобы можно было вызывать shareInviteLink из экрана
export async function shareInviteLink(inviteCode: string) {
  const url = makeInviteLink(inviteCode);
  await Share.share({
    message: `Join our family in GAD Family\nInvite code: ${inviteCode}\n${url}`,
  });
  return url;
}
