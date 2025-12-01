// apps/mobile/src/lib/chat.ts

import { db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  limit,
  Unsubscribe,
  arrayUnion,
} from "firebase/firestore";

import {
  Chat,
  ChatMessage,
  UserChatMeta,
  TimestampLike,
} from "./chatTypes";

// Approximate shape of user documents in Firestore.
type UserDoc = {
  uid: string;
  familyId?: string | null;
  age?: number | null;
  role?: "parent" | "child" | "owner" | "other";
  status?: "active" | "blocked" | "deleted";
};

// --- Internal helpers ---

async function loadUser(uid: string): Promise<UserDoc | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  return {
    uid: snap.id,
    familyId: data.familyId ?? null,
    age: data.age ?? null,
    role: data.role ?? "other",
    status: data.status ?? "active",
  };
}

function mapChatDoc(docSnap: any): Chat {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ...data,
  } as Chat;
}

function mapMessageDoc(docSnap: any): ChatMessage {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ...data,
  } as ChatMessage;
}

// --- 2.1 Deterministic DM chatId ---

export function buildDmChatId(uidA: string, uidB: string): string {
  return uidA < uidB ? `dm_${uidA}_${uidB}` : `dm_${uidB}_${uidA}`;
}

// --- 2.2 ensureFamilyChat ---

export async function ensureFamilyChat(
  familyId: string,
  currentUid: string
): Promise<Chat> {
  try {
    const chatsCol = collection(db, "chats");

    // Try to find existing family chat
    const qChats = query(
      chatsCol,
      where("type", "==", "family"),
      where("familyId", "==", familyId)
    );

    const existingSnap = await getDocs(qChats);
    if (!existingSnap.empty) {
      const docSnap = existingSnap.docs[0];
      return mapChatDoc(docSnap);
    }

    // Load all active family members
    const usersCol = collection(db, "users");
    const qUsers = query(
      usersCol,
      where("familyId", "==", familyId),
      where("status", "==", "active")
    );

    const usersSnap = await getDocs(qUsers);
    const memberIds: string[] = usersSnap.docs.map((d) => d.id);

    // Ensure creator is included
    if (!memberIds.includes(currentUid)) {
      memberIds.push(currentUid);
    }

    const newChatRef = doc(chatsCol); // auto-generated id
    const chatData: Chat = {
      id: newChatRef.id,
      type: "family",
      familyId,
      memberIds,
      title: "Family Chat",
      createdAt: serverTimestamp() as TimestampLike,
      createdBy: currentUid,
      lastMessagePreview: "",
      lastMessageAt: null as any,
      lastMessageSenderId: undefined,
      isArchived: false,
      allowMedia: true,
      allowExternalLinks: false,
    };

    await setDoc(newChatRef, chatData);

    return chatData;
  } catch (err) {
    console.log("[ensureFamilyChat] Error:", err);
    throw err;
  }
}

// --- 2.3 createDmChatWithChecks ---

export async function createDmChatWithChecks(
  currentUid: string,
  targetUid: string
): Promise<Chat> {
  if (currentUid === targetUid) {
    throw new Error("Cannot create DM with yourself.");
  }

  try {
    const [currentUser, targetUser] = await Promise.all([
      loadUser(currentUid),
      loadUser(targetUid),
    ]);

    if (!currentUser || !targetUser) {
      throw new Error("User not found.");
    }

    if (currentUser.status !== "active" || targetUser.status !== "active") {
      throw new Error("Both users must be active.");
    }

    const currentFamilyId = currentUser.familyId ?? null;
    const targetFamilyId = targetUser.familyId ?? null;
    const hasCommonFamily =
      currentFamilyId && targetFamilyId && currentFamilyId === targetFamilyId;

    // For now, both users must share the same family.
    if (!hasCommonFamily) {
      throw new Error(
        "DM chats currently allowed only between members of the same family."
      );
    }

    const ageCurrent = currentUser.age ?? null;
    const ageTarget = targetUser.age ?? null;

    // Age rules (simplified for now):
    // If either user is < 14, they must share the same family (already enforced).
    if (
      (ageCurrent !== null && ageCurrent < 14) ||
      (ageTarget !== null && ageTarget < 14)
    ) {
      if (!hasCommonFamily) {
        throw new Error(
          "Children under 14 can chat only within their own family."
        );
      }
    }

    // TODO: Extend for teens 14–17 to allow approved contacts from outside the family.

    const chatId = buildDmChatId(currentUid, targetUid);
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);

    if (chatSnap.exists()) {
      return mapChatDoc(chatSnap);
    }

    const memberIds = [currentUid, targetUid];
    const chatData: Chat = {
      id: chatId,
      type: "dm",
      familyId: hasCommonFamily ? (currentFamilyId as string) : undefined,
      memberIds,
      title: undefined,
      createdAt: serverTimestamp() as TimestampLike,
      createdBy: currentUid,
      lastMessagePreview: "",
      lastMessageAt: null as any,
      lastMessageSenderId: undefined,
      isArchived: false,
      allowMedia: true,
      allowExternalLinks: false,
    };

    await setDoc(chatRef, chatData);

    return chatData;
  } catch (err) {
    console.log("[createDmChatWithChecks] Error:", err);
    throw err;
  }
}

// --- 2.4 sendTextMessage ---

export async function sendTextMessage(
  chatId: string,
  senderId: string,
  text: string
): Promise<ChatMessage> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Message text cannot be empty.");
  }

  try {
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      throw new Error("Chat does not exist.");
    }

    const chat = mapChatDoc(chatSnap);

    if (!Array.isArray(chat.memberIds) || !chat.memberIds.includes(senderId)) {
      throw new Error("Sender is not a member of this chat.");
    }

    const messagesCol = collection(db, "chats", chatId, "messages");
    const messageRef = doc(messagesCol);
    const createdAt = serverTimestamp() as TimestampLike;

    const messageData: ChatMessage = {
      id: messageRef.id,
      chatId,
      senderId,
      type: "text",
      text: trimmed,
      createdAt,
      deliveredTo: [senderId],
      readBy: [senderId],
    };

    await setDoc(messageRef, messageData);

    await updateDoc(chatRef, {
      lastMessagePreview: trimmed.slice(0, 120),
      lastMessageAt: createdAt,
      lastMessageSenderId: senderId,
    });

    return messageData;
  } catch (err) {
    console.log("[sendTextMessage] Error:", err);
    throw err;
  }
}

// --- 2.5 sendMediaMessage ---

export type MediaPayload = {
  mediaUrl: string;
  mediaType: string;
  mediaSize?: number;
  thumbnailUrl?: string;
};

function getMediaPreviewLabel(messageType: "image" | "file" | "voice"): string {
  switch (messageType) {
    case "image":
      return "📷 Photo";
    case "file":
      return "📎 File";
    case "voice":
      return "🎤 Voice message";
    default:
      return "📎 Attachment";
  }
}

export async function sendMediaMessage(
  chatId: string,
  senderId: string,
  payload: MediaPayload,
  messageType: "image" | "file" | "voice"
): Promise<ChatMessage> {
  try {
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      throw new Error("Chat does not exist.");
    }

    const chat = mapChatDoc(chatSnap);

    if (!Array.isArray(chat.memberIds) || !chat.memberIds.includes(senderId)) {
      throw new Error("Sender is not a member of this chat.");
    }

    const messagesCol = collection(db, "chats", chatId, "messages");
    const messageRef = doc(messagesCol);
    const createdAt = serverTimestamp() as TimestampLike;

    const messageData: ChatMessage = {
      id: messageRef.id,
      chatId,
      senderId,
      type: messageType,
      mediaUrl: payload.mediaUrl,
      mediaType: payload.mediaType,
      mediaSize: payload.mediaSize,
      thumbnailUrl: payload.thumbnailUrl,
      createdAt,
      deliveredTo: [senderId],
      readBy: [senderId],
    };

    await setDoc(messageRef, messageData);

    const preview = getMediaPreviewLabel(messageType);

    await updateDoc(chatRef, {
      lastMessagePreview: preview,
      lastMessageAt: createdAt,
      lastMessageSenderId: senderId,
    });

    return messageData;
  } catch (err) {
    console.log("[sendMediaMessage] Error:", err);
    throw err;
  }
}

// --- 2.6 Read / delivered & reactions ---

export async function markMessageDelivered(
  chatId: string,
  messageId: string,
  uid: string
): Promise<void> {
  try {
    const msgRef = doc(db, "chats", chatId, "messages", messageId);
    await updateDoc(msgRef, {
      deliveredTo: arrayUnion(uid),
    });
  } catch (err) {
    console.log("[markMessageDelivered] Error:", err);
    // no rethrow; delivered status is not critical
  }
}

export async function markMessageRead(
  chatId: string,
  messageId: string,
  uid: string
): Promise<void> {
  try {
    const msgRef = doc(db, "chats", chatId, "messages", messageId);

    await updateDoc(msgRef, {
      readBy: arrayUnion(uid),
    });

    const metaRef = doc(db, "userChatMeta", uid, "chats", chatId);
    const now = serverTimestamp() as TimestampLike;

    const metaData: Partial<UserChatMeta> = {
      chatId,
      uid,
      lastReadAt: now,
      lastReadMessageId: messageId,
    };

    await setDoc(metaRef, metaData, { merge: true });
  } catch (err) {
    console.log("[markMessageRead] Error:", err);
    // no rethrow; read status is not critical
  }
}

export async function toggleReaction(
  chatId: string,
  messageId: string,
  emoji: string,
  uid: string
): Promise<void> {
  try {
    const msgRef = doc(db, "chats", chatId, "messages", messageId);
    const snap = await getDoc(msgRef);

    if (!snap.exists()) {
      return;
    }

    const data = snap.data() as any;
    const reactions = { ...(data.reactions || {}) } as {
      [key: string]: string[];
    };

    const current = new Set<string>(reactions[emoji] || []);

    if (current.has(uid)) {
      current.delete(uid);
    } else {
      current.add(uid);
    }

    const updatedList = Array.from(current);
    if (updatedList.length === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = updatedList;
    }

    await updateDoc(msgRef, { reactions });
  } catch (err) {
    console.log("[toggleReaction] Error:", err);
    // no rethrow; reactions are non-critical
  }
}

// --- 2.7 Subscriptions for UI ---

export function subscribeToUserChats(
  uid: string,
  cb: (chats: Chat[]) => void
): Unsubscribe {
  const chatsCol = collection(db, "chats");
  const qChats = query(chatsCol, where("memberIds", "array-contains", uid));

  const unsubscribe = onSnapshot(
    qChats,
    (snapshot) => {
      const chats: Chat[] = snapshot.docs
        .map(mapChatDoc)
        .filter((c) => !c.isArchived);
      cb(chats);
    },
    (error) => {
      console.log("[subscribeToUserChats] Error:", error);
    }
  );

  return unsubscribe;
}

export function subscribeToMessages(
  chatId: string,
  limitCount: number,
  cb: (messages: ChatMessage[]) => void
): Unsubscribe {
  const messagesCol = collection(db, "chats", chatId, "messages");
  const qMessages = query(
    messagesCol,
    orderBy("createdAt", "asc"),
    limit(limitCount)
  );

  const unsubscribe = onSnapshot(
    qMessages,
    (snapshot) => {
      const messages: ChatMessage[] = snapshot.docs.map(mapMessageDoc);
      cb(messages);
    },
    (error) => {
      console.log("[subscribeToMessages] Error:", error);
    }
  );

  return unsubscribe;
}

// --- 2.8 UserChatMeta subscription (unread support) ---

export function subscribeToUserChatMeta(
  uid: string,
  cb: (meta: UserChatMeta[]) => void
): Unsubscribe {
  const metaCol = collection(db, "userChatMeta", uid, "chats");
  const qMeta = query(metaCol);

  const unsubscribe = onSnapshot(
    qMeta,
    (snapshot) => {
      const list: UserChatMeta[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          chatId: data.chatId ?? docSnap.id,
          uid: uid,
          ...data,
        } as UserChatMeta;
      });
      cb(list);
    },
    (error) => {
      console.log("[subscribeToUserChatMeta] Error:", error);
    }
  );

  return unsubscribe;
}
