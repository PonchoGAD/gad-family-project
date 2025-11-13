// apps/mobile/src/lib/authClient.ts
import { auth } from "../firebase";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";

export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;
  const res = await signInAnonymously(auth);
  return res.user;
}
