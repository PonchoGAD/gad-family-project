import { auth, db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export async function ensureUserDoc() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { createdAt: serverTimestamp() }, { merge: true });
  }
  return ref;
}
