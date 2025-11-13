// apps/mobile/src/lib/user.ts
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * Ensure that users/{uid} document exists.
 * Creates a minimal stub if missing.
 */
export async function ensureUserDoc() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        createdAt: serverTimestamp(),
        // you can extend here later: email, displayName, etc.
      },
      { merge: true }
    );
  }

  return ref;
}
