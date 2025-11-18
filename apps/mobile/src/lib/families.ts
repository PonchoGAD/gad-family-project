// apps/mobile/src/lib/families.ts

import { auth, db } from "../firebase";
import { nanoid } from "nanoid";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import * as Linking from "expo-linking";
import { Share } from "react-native";
import {
  listenToFamilyTasksConverter,
  FamilyTask,
} from "../types/tasks";
import { distanceM } from "./geo";

export type FamilyMember = {
  id: string;
  joinedAt?: any;
  lastLocation?: { lat: number; lng: number };
};

export type FamilyLocation = {
  lat: number;
  lng: number;
  city?: string;
  country?: string;
};

export type FamilyChildProfile = {
  age?: number;
};

export type Family = {
  id: string;
  name?: string;
  ownerUid?: string | null;
  inviteCode?: string | null;
  createdAt?: any;

  location?: FamilyLocation | null;
  children?: FamilyChildProfile[];
  interests?: string[];
  findFriendsEnabled?: boolean;
};

/**
 * Create a new family and attach current user as owner + member.
 */
export async function createFamily(name: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");

  const fid = nanoid(10);
  const inviteCode = nanoid(6).toUpperCase();

  const familyRef = doc(db, "families", fid);

  await setDoc(familyRef, {
    name,
    ownerUid: uid,
    inviteCode,
    createdAt: serverTimestamp(),
    findFriendsEnabled: false,
    interests: [],
  });

  await setDoc(
    doc(db, "families", fid, "members", uid),
    { joinedAt: serverTimestamp() },
    { merge: true }
  );

  await setDoc(
    doc(db, "users", uid),
    { familyId: fid },
    { merge: true }
  );

  return { fid, inviteCode };
}

/**
 * Join family by invite code
 */
export async function joinFamilyByCode(code: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");

  const q = query(
    collection(db, "families"),
    where("inviteCode", "==", code.toUpperCase())
  );

  const snaps = await getDocs(q);
  if (snaps.empty) throw new Error("Family not found");

  const ref = snaps.docs[0].ref;
  const fid = ref.id;

  await setDoc(
    doc(db, "families", fid, "members", uid),
    { joinedAt: serverTimestamp() },
    { merge: true }
  );

  await setDoc(
    doc(db, "users", uid),
    { familyId: fid },
    { merge: true }
  );

  return fid;
}

/**
 * Load family document
 */
export async function getFamily(fid: string) {
  const snap = await getDoc(doc(db, "families", fid));
  return snap.exists()
    ? ({ id: fid, ...(snap.data() as any) } as Family)
    : null;
}

/**
 * Get current user's familyId
 */
export async function getCurrentUserFamilyId() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const uSnap = await getDoc(doc(db, "users", uid));
  if (!uSnap.exists()) return null;
  return (uSnap.data()?.familyId as string | undefined) ?? null;
}

/**
 * Subscribe to family doc
 */
export function subscribeFamily(
  fid: string,
  cb: (family: Family | null) => void
) {
  const ref = doc(db, "families", fid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) return cb(null);
    cb({ id: fid, ...(snap.data() as any) } as Family);
  });
}

/**
 * Subscribe to family members
 */
export function subscribeMembers(
  fid: string,
  cb: (members: FamilyMember[]) => void
) {
  const coll = collection(db, "families", fid, "members");
  return onSnapshot(coll, (qs) => {
    const items = qs.docs.map(
      (d) => ({ id: d.id, ...(d.data() as any) } as FamilyMember)
    );
    cb(items);
  });
}

/**
 * Set family owner
 */
export async function setFamilyOwner(fid: string, ownerUid: string) {
  await setDoc(
    doc(db, "families", fid),
    { ownerUid },
    { merge: true }
  );
}

/**
 * Build invite link
 */
export function makeInviteLink(inviteCode: string) {
  return Linking.createURL("/join", {
    queryParams: { code: inviteCode },
  });
}

export async function shareInviteLink(inviteCode: string) {
  const url = makeInviteLink(inviteCode);
  await Share.share({
    message: `Join our family in GAD Family\nInvite code: ${inviteCode}\n${url}`,
  });
  return url;
}

/**
 * Family tasks
 */
export function listenFamilyTasks(
  fid: string,
  cb: (items: any[]) => void
) {
  const coll = collection(doc(db, "families", fid), "tasks");
  return onSnapshot(coll, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    cb(items);
  });
}

export async function createFamilyTask(
  fid: string,
  data: {
    title: string;
    description?: string;
    createdBy: string;
    assignedTo?: string[];
    status?: "open" | "done";
  }
) {
  const taskRef = doc(collection(db, "families", fid, "tasks"));
  await setDoc(
    taskRef,
    {
      ...data,
      status: data.status ?? "open",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  return taskRef.id;
}

export async function toggleFamilyTask(
  fid: string,
  taskId: string,
  status: "open" | "done"
) {
  await setDoc(
    doc(db, "families", fid, "tasks", taskId),
    { status },
    { merge: true }
  );
}

/**
 * Update family settings (FIRST VALID VERSION)
 */
export async function updateFamilySettings(
  fid: string,
  data: Partial<{
    name: string;
    location: FamilyLocation | null;
    children: FamilyChildProfile[];
    interests: string[];
    findFriendsEnabled: boolean;
  }>
) {
  await setDoc(
    doc(db, "families", fid),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export type DiscoverableFamily = Family & {
  distanceKm?: number;
};

/**
 * Find friends around (FIRST VALID VERSION)
 */
export async function loadDiscoverableFamiliesAround(
  centerLat: number,
  centerLng: number,
  radiusKm = 10,
  currentFamilyId?: string | null
): Promise<DiscoverableFamily[]> {
  const qRef = query(
    collection(db, "families"),
    where("findFriendsEnabled", "==", true)
  );

  const snap = await getDocs(qRef);
  const out: DiscoverableFamily[] = [];

  snap.forEach((d) => {
    const id = d.id;
    if (currentFamilyId && id === currentFamilyId) return;

    const v = d.data() as any;
    const loc = v.location;

    if (!loc?.lat || !loc?.lng) return;

    const distKm = distanceM(centerLat, centerLng, loc.lat, loc.lng) / 1000;
    if (distKm <= radiusKm) {
      out.push({
        id,
        ...v,
        distanceKm: distKm,
      });
    }
  });

  out.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  return out;
}
