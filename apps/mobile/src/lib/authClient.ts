// apps/mobile/src/lib/authClient.ts
import { auth } from "../firebase";
import {
  onAuthStateChanged,
  signInAnonymously,
  User,
} from "firebase/auth";

/**
 * Single global promise to ensure we sign in exactly once.
 */
let ready: Promise<User | null> | null = null;

export function ensureAuth(): Promise<User | null> {
  if (ready) return ready;

  ready = new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        try {
          if (!user) {
            const cred = await signInAnonymously(auth);
            resolve(cred.user);
          } else {
            resolve(user);
          }
        } catch (e) {
          reject(e);
        } finally {
          unsub();
        }
      },
      (err) => {
        unsub();
        reject(err);
      }
    );
  });

  return ready;
}
