// apps/mobile/src/lib/chat.ts

import { db, auth } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";

export type FamilyChat = {
  id: string;
  title: string;
  members: string[];
  createdAt: any;
};

export type FamilyMessage = {
  id: string;
  senderUid: string;
  text: string;
  createdAt: any;
};

/**
 * Create chat inside family
 */
export async function createFamilyChat(fid: string, title: string, members: string[]) {
  const ref = collection(db, "families", fid, "chats");
  const docRef = await addDoc(ref, {
    title,
    members,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Send message to chat
 */
export async function sendFamilyMessage(fid: string, chatId: string, text: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");

  const ref = collection(db, "families", fid, "chats", chatId, "messages");
  await addDoc(ref, {
    senderUid: uid,
    text,
    createdAt: serverTimestamp(),
  });
}

/**
 * Subscribe chat list
 */
export function listenFamilyChats(fid: string, cb: (chats: FamilyChat[]) => void) {
  const ref = collection(db, "families", fid, "chats");
  return onSnapshot(ref, (snap) => {
    const arr: FamilyChat[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));
    cb(arr);
  });
}

/**
 * Subscribe messages inside chat
 */
export function listenFamilyMessages(
  fid: string,
  chatId: string,
  cb: (msgs: FamilyMessage[]) => void
) {
  const ref = query(
    collection(db, "families", fid, "chats", chatId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(ref, (snap) => {
    const arr: FamilyMessage[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));
    cb(arr);
  });
}
