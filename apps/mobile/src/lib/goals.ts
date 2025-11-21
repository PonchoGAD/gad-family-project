// apps/mobile/src/lib/goals.ts

import { db, auth } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";

export type FamilyGoalStatus = "active" | "done" | "archived";

export type FamilyGoal = {
  id: string;
  title: string;
  targetPoints: number;
  currentPoints: number;
  status: FamilyGoalStatus;
  createdAt?: any;
};

export type CreateGoalInput = {
  title: string;
  targetPoints: number;
};

/**
 * Get current user's familyId (helper, дублирует логику из lib/families,
 * но без циклических импортов).
 */
async function getCurrentUserFamilyId(): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return (snap.data()?.familyId as string | undefined) ?? null;
}

/**
 * Subscribe to family goals list, ordered by createdAt desc.
 */
export function subscribeFamilyGoals(
  fid: string,
  cb: (goals: FamilyGoal[]) => void
) {
  const goalsRef = collection(db, "families", fid, "goals");
  const q = query(goalsRef, orderBy("createdAt", "desc"));

  return onSnapshot(q, (snap) => {
    const arr: FamilyGoal[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      arr.push({
        id: d.id,
        title: data.title ?? "",
        targetPoints: Number(data.targetPoints ?? 0) || 0,
        currentPoints: Number(data.currentPoints ?? 0) || 0,
        status: (data.status as FamilyGoalStatus) ?? "active",
        createdAt: data.createdAt,
      });
    });
    cb(arr);
  });
}

/**
 * One-off load of family goals.
 */
export async function loadFamilyGoals(fid: string): Promise<FamilyGoal[]> {
  const goalsRef = collection(db, "families", fid, "goals");
  const q = query(goalsRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const arr: FamilyGoal[] = [];
  snap.forEach((d) => {
    const data = d.data() as any;
    arr.push({
      id: d.id,
      title: data.title ?? "",
      targetPoints: Number(data.targetPoints ?? 0) || 0,
      currentPoints: Number(data.currentPoints ?? 0) || 0,
      status: (data.status as FamilyGoalStatus) ?? "active",
      createdAt: data.createdAt,
    });
  });
  return arr;
}

/**
 * Create a new goal in a specific family.
 */
export async function createFamilyGoal(
  fid: string,
  input: CreateGoalInput
): Promise<string> {
  const title = input.title.trim();
  const target = Number(input.targetPoints || 0);

  if (!title) {
    throw new Error("Goal title is required");
  }
  if (!target || target <= 0) {
    throw new Error("Target points must be positive");
  }

  const ref = doc(collection(db, "families", fid, "goals"));
  await setDoc(ref, {
    title,
    targetPoints: target,
    currentPoints: 0,
    status: "active",
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

/**
 * Create goal for "current user's family" (если нужно из скринов).
 */
export async function createGoalForCurrentFamily(
  input: CreateGoalInput
): Promise<{ fid: string; goalId: string }> {
  const fid = await getCurrentUserFamilyId();
  if (!fid) throw new Error("No family for current user");

  const goalId = await createFamilyGoal(fid, input);
  return { fid, goalId };
}

/**
 * Add points to goal (increment currentPoints).
 * deltaPoints может быть отрицательным (чтобы откатить).
 */
export async function addPointsToGoal(
  fid: string,
  goalId: string,
  deltaPoints: number
) {
  if (!deltaPoints) return;
  const ref = doc(db, "families", fid, "goals", goalId);

  await updateDoc(ref, {
    currentPoints: increment(deltaPoints),
  });
}

/**
 * Set absolute currentPoints (если хочешь жёстко переписать прогресс).
 */
export async function setGoalProgress(
  fid: string,
  goalId: string,
  newPoints: number
) {
  const value = Number(newPoints || 0);
  const ref = doc(db, "families", fid, "goals", goalId);

  await updateDoc(ref, {
    currentPoints: value,
  });
}

/**
 * Mark goal as done.
 */
export async function markGoalDone(fid: string, goalId: string) {
  const ref = doc(db, "families", fid, "goals", goalId);
  await updateDoc(ref, {
    status: "done",
  });
}

/**
 * Archive goal (optional helper).
 */
export async function archiveGoal(fid: string, goalId: string) {
  const ref = doc(db, "families", fid, "goals", goalId);
  await updateDoc(ref, {
    status: "archived",
  });
}
