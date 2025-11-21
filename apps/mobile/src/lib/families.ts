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
  orderBy,
  addDoc,
  updateDoc,
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
  isAdult?: boolean;
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
    { joinedAt: serverTimestamp(), isAdult: true },
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

  const qRef = query(
    collection(db, "families"),
    where("inviteCode", "==", code.toUpperCase())
  );

  const snaps = await getDocs(qRef);
  if (snaps.empty) throw new Error("Family not found");

  const ref = snaps.docs[0].ref;
  const fid = ref.id;

  await setDoc(
    doc(db, "families", fid, "members", uid),
    { joinedAt: serverTimestamp(), isAdult: true },
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
export async function getCurrentUserFamilyId(): Promise<string | null> {
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

/* ------------------------------------------------------------------ */
/* Friendship model: friendRequests + friends                         */
/* ------------------------------------------------------------------ */

export type FriendRequestStatus = "pending" | "accepted" | "rejected";

export type FriendRequest = {
  id: string;
  fromFamilyId: string;
  toFamilyId: string;
  status: FriendRequestStatus;
  createdAt?: any;
  // локальное поле, чтобы на экране понимать входящие/исходящие
  direction?: "incoming" | "outgoing";
};

export type FamilyFriend = {
  id: string; // other family id
  since?: any;
  lastChatId?: string | null;
};

/**
 * Отправка заявки в друзья между семьями.
 * Пишем 2 документа:
 * - в fromFamily.friendRequests: direction = "outgoing"
 * - в toFamily.friendRequests: direction = "incoming"
 */
export async function sendFriendRequest(
  fromFamilyId: string,
  toFamilyId: string
) {
  if (!fromFamilyId || !toFamilyId) {
    throw new Error("Family ids required");
  }
  if (fromFamilyId === toFamilyId) {
    throw new Error("Cannot befriend the same family");
  }

  const reqId = nanoid(12);
  const base = {
    id: reqId,
    fromFamilyId,
    toFamilyId,
    status: "pending" as FriendRequestStatus,
    createdAt: serverTimestamp(),
  };

  const fromRef = doc(db, "families", fromFamilyId, "friendRequests", reqId);
  const toRef = doc(db, "families", toFamilyId, "friendRequests", reqId);

  await Promise.all([
    setDoc(
      fromRef,
      {
        ...base,
        direction: "outgoing",
      },
      { merge: true }
    ),
    setDoc(
      toRef,
      {
        ...base,
        direction: "incoming",
      },
      { merge: true }
    ),
  ]);

  return reqId;
}

/**
 * Подписка на заявки в друзья для семьи.
 * Возвращает и входящие, и исходящие (через direction).
 */
export function subscribeFriendRequests(
  fid: string,
  cb: (items: FriendRequest[]) => void
) {
  const collRef = collection(db, "families", fid, "friendRequests");
  return onSnapshot(collRef, (snap) => {
    const arr: FriendRequest[] = snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as any) } as FriendRequest)
    );
    cb(arr);
  });
}

/**
 * Подписка на друзей семьи.
 */
export function subscribeFriends(
  fid: string,
  cb: (items: FamilyFriend[]) => void
) {
  const collRef = collection(db, "families", fid, "friends");
  return onSnapshot(collRef, (snap) => {
    const arr: FamilyFriend[] = snap.docs.map(
      (d) =>
        ({
          id: d.id,
          ...(d.data() as any),
        } as FamilyFriend)
    );
    cb(arr);
  });
}

/**
 * Принять заявку в друзья.
 * Обновляем статус в обоих family.friendRequests
 * + создаём записи в families/{fid}/friends.
 */
export async function acceptFriendRequest(
  myFamilyId: string,
  req: FriendRequest
) {
  const { fromFamilyId, toFamilyId, id } = req;
  if (!id || !fromFamilyId || !toFamilyId) {
    throw new Error("Invalid friend request");
  }

  const a = fromFamilyId;
  const b = toFamilyId;

  const refAReq = doc(db, "families", a, "friendRequests", id);
  const refBReq = doc(db, "families", b, "friendRequests", id);

  const refAFriend = doc(db, "families", a, "friends", b);
  const refBFriend = doc(db, "families", b, "friends", a);

  await Promise.all([
    setDoc(
      refAReq,
      { status: "accepted" as FriendRequestStatus },
      { merge: true }
    ),
    setDoc(
      refBReq,
      { status: "accepted" as FriendRequestStatus },
      { merge: true }
    ),
    setDoc(
      refAFriend,
      {
        since: serverTimestamp(),
        lastChatId: null,
      },
      { merge: true }
    ),
    setDoc(
      refBFriend,
      {
        since: serverTimestamp(),
        lastChatId: null,
      },
      { merge: true }
    ),
  ]);
}

/**
 * Отклонить заявку в друзья.
 * Просто статус "rejected" в обоих family.friendRequests.
 */
export async function rejectFriendRequest(req: FriendRequest) {
  const { fromFamilyId, toFamilyId, id } = req;
  if (!id || !fromFamilyId || !toFamilyId) {
    throw new Error("Invalid friend request");
  }

  const a = fromFamilyId;
  const b = toFamilyId;

  const refAReq = doc(db, "families", a, "friendRequests", id);
  const refBReq = doc(db, "families", b, "friendRequests", id);

  await Promise.all([
    setDoc(
      refAReq,
      { status: "rejected" as FriendRequestStatus },
      { merge: true }
    ),
    setDoc(
      refBReq,
      { status: "rejected" as FriendRequestStatus },
      { merge: true }
    ),
  ]);
}

/* ------------------------------------------------------------------ */
/* Multi-family chats                                                 */
/* ------------------------------------------------------------------ */

export type FamilyChat = {
  id: string;
  membersFamilies: string[];
  lastMessageText?: string;
  lastMessageAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

export type FamilyChatMessage = {
  id: string;
  text: string;
  senderUid: string;
  senderFamilyId: string;
  createdAt?: any;
};

/**
 * Создать (или вернуть существующий) чат между двумя семьями.
 * Фан-аут: чат-документ лежит под каждой семьёй в /families/{fid}/chats/{chatId}.
 */
export async function createMultiFamilyChat(
  myFid: string,
  otherFid: string
): Promise<string> {
  if (!myFid || !otherFid) {
    throw new Error("Family ids required");
  }
  if (myFid === otherFid) {
    throw new Error("Cannot create chat with the same family");
  }

  // 1) Проверяем, нет ли уже чата между этими семьями под myFid
  const chatsColl = collection(db, "families", myFid, "chats");
  const existingQ = query(
    chatsColl,
    where("membersFamilies", "array-contains", otherFid)
  );
  const existingSnap = await getDocs(existingQ);

  if (!existingSnap.empty) {
    // Берём первый найденный чат
    return existingSnap.docs[0].id;
  }

  // 2) Создаём новый chatId
  const chatId = nanoid(12);
  const members = [myFid, otherFid];

  const baseChat = {
    membersFamilies: members,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessageText: "",
    lastMessageAt: null,
  };

  // 3) Фан-аут чата под каждую семью
  await Promise.all(
    members.map((fid) =>
      setDoc(
        doc(db, "families", fid, "chats", chatId),
        baseChat,
        { merge: true }
      )
    )
  );

  // 4) Обновляем lastChatId в friends (если дружба уже есть)
  const refAFriend = doc(db, "families", myFid, "friends", otherFid);
  const refBFriend = doc(db, "families", otherFid, "friends", myFid);

  await Promise.all([
    setDoc(refAFriend, { lastChatId: chatId }, { merge: true }),
    setDoc(refBFriend, { lastChatId: chatId }, { merge: true }),
  ]);

  return chatId;
}

/**
 * Подписка на список чатов семьи, отсортированных по updatedAt desc.
 */
export function subscribeFamilyChats(
  fid: string,
  cb: (chats: FamilyChat[]) => void
) {
  const collRef = collection(db, "families", fid, "chats");
  const qRef = query(collRef, orderBy("updatedAt", "desc"));

  return onSnapshot(qRef, (snap) => {
    const arr: FamilyChat[] = snap.docs.map(
      (d) =>
        ({
          id: d.id,
          ...(d.data() as any),
        } as FamilyChat)
    );
    cb(arr);
  });
}

/**
 * Отправить сообщение в multi-family чат.
 * Фан-аут сообщения и updatedAt/lastMessageText под все семьи-участники.
 */
export async function sendFamilyChatMessage(
  fid: string,
  chatId: string,
  text: string
) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");

  const trimmed = text.trim();
  if (!trimmed) return;

  // 1) Читаем чат под своей семьёй, чтобы узнать всех участников
  const chatRef = doc(db, "families", fid, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) {
    throw new Error("Chat not found");
  }

  const data = chatSnap.data() as any;
  const membersFamilies: string[] = Array.isArray(data.membersFamilies)
    ? data.membersFamilies
    : [fid];

  const messagePayload = {
    text: trimmed,
    senderUid: uid,
    senderFamilyId: fid,
    createdAt: serverTimestamp(),
  };

  const updatePayload = {
    lastMessageText: trimmed,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 2) Фан-аутим сообщение и обновление чата под каждую семью
  await Promise.all(
    membersFamilies.map(async (familyId) => {
      const msgColl = collection(
        db,
        "families",
        familyId,
        "chats",
        chatId,
        "messages"
      );
      await addDoc(msgColl, messagePayload);

      const famChatRef = doc(db, "families", familyId, "chats", chatId);
      await setDoc(famChatRef, updatePayload, { merge: true });
    })
  );
}

/**
 * Подписка на сообщения чата
 */
export function subscribeFamilyMessages(
  fid: string,
  chatId: string,
  cb: (msgs: FamilyChatMessage[]) => void
) {
  const coll = collection(
    db,
    "families",
    fid,
    "chats",
    chatId,
    "messages"
  );

  const q = query(coll, orderBy("createdAt", "asc"));

  return onSnapshot(q, (snap) => {
    const arr = snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as any) } as FamilyChatMessage)
    );
    cb(arr);
  });
}
