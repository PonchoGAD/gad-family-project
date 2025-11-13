import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { US_REGIONS } from "../config";

/** Helpers */
async function getFamilyContext(uid: string) {
  const db = admin.firestore();
  const u = await db.collection("users").doc(uid).get();
  const fid = u.data()?.familyId as string | undefined;
  if (!fid) throw new HttpsError("failed-precondition", "Join family first");
  const famRef = db.collection("families").doc(fid);
  const fam = (await famRef.get()).data();
  if (!fam) throw new HttpsError("not-found", "Family not found");
  return { db, fid, famRef, fam };
}

function sanitizeText(s: string) {
  const trimmed = (s || "").toString().trim();
  // Базовая защита: обрезка длины и простейший фильтр
  const maxLen = 4000;
  let out = trimmed.slice(0, maxLen);
  // пример очень простого фильтра — заменяем потенциальные оскорбления (расширишь по желанию)
  out = out.replace(/\b(fuck|shit|bitch)\b/gi, "****");
  return out;
}

async function ensureGeneralThread(famRef: FirebaseFirestore.DocumentReference) {
  const genRef = famRef.collection("threads").doc("general");
  const gen = await genRef.get();
  if (!gen.exists) {
    await genRef.set({
      title: "Family chat",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      system: true,
      participants: admin.firestore.FieldValue.delete(), // опционально: будем хранить в подколлекции
      lastMessage: null,
    });
  }
}

async function isFamilyMember(famRef: FirebaseFirestore.DocumentReference, uid: string) {
  const m = await famRef.collection("members").doc(uid).get();
  return m.exists;
}

async function pushTo(tokens: string[], title: string, body: string, data: any = {}) {
  if (!tokens?.length) return;
  try {
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
    });
  } catch (e) {
    console.error("chat pushTo error:", e);
  }
}

// Базовый rate-limit по пользователю: не чаще 1 сообщения в 1.5 сек
async function checkRateLimit(db: FirebaseFirestore.Firestore, uid: string) {
  const rlRef = db.collection("users").doc(uid).collection("chatMeta").doc("rate");
  const snap = await rlRef.get();
  const now = Date.now();
  const last = snap.exists ? (snap.data()?.lastTs as number | undefined) : undefined;
  if (last && now - last < 1500) {
    throw new HttpsError("resource-exhausted", "Too many messages. Please wait a bit.");
  }
  await rlRef.set({ lastTs: now }, { merge: true });
}

/** ===================== API ===================== **/

// 1) создать тред (или получить general)
export const createFamilyThread = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { title } = req.data as { title?: string };

    const { db, fid, famRef } = await getFamilyContext(uid);
    await ensureGeneralThread(famRef);

    if (!title || !title.trim() || title.trim().toLowerCase() === "general") {
      // вернуть general
      return { ok: true, tid: "general" };
    }

    // только взрослые или владелец — на своё усмотрение, здесь позволим любому члену семьи
    const tidRef = famRef.collection("threads").doc();
    await tidRef.set({
      title: title.trim().slice(0, 80),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      system: false,
      lastMessage: null,
    });
    return { ok: true, tid: tidRef.id };
  },
);

// 2) список тредов
export const listFamilyThreads = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { famRef } = await getFamilyContext(uid);
    await ensureGeneralThread(famRef);

    const snap = await famRef.collection("threads").orderBy("updatedAt", "desc").limit(100).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return { ok: true, items };
  },
);

// 3) отправить текстовое сообщение
export const sendFamilyMessage = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");

    const { tid, text, replyTo } = req.data as {
      tid: string; text: string; replyTo?: string | null;
    };
    if (!tid || typeof text !== "string") throw new HttpsError("invalid-argument", "tid/text required");

    const { db, fid, famRef } = await getFamilyContext(uid);
    if (!(await isFamilyMember(famRef, uid))) throw new HttpsError("permission-denied", "Not a family member");

    await ensureGeneralThread(famRef);
    await checkRateLimit(db, uid);

    const tRef = famRef.collection("threads").doc(tid);
    const tDoc = await tRef.get();
    if (!tDoc.exists) throw new HttpsError("not-found", "Thread not found");

    const safe = sanitizeText(text);
    if (!safe) throw new HttpsError("invalid-argument", "Empty message");

    const midRef = tRef.collection("messages").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await midRef.set({
      fromUid: uid,
      type: "text",
      text: safe,
      replyTo: replyTo || null,
      createdAt: now,
      editedAt: null,
      deleted: false,
      reactions: {}, // emoji -> array of uids (опционально можно хранить count)
    });

    await tRef.set(
      {
        updatedAt: now,
        lastMessage: { fromUid: uid, text: safe.slice(0, 120), at: now, type: "text" },
      },
      { merge: true },
    );

    return { ok: true, mid: midRef.id };
  },
);

// 4) зарегистрировать медиа-сообщение (после загрузки файла клиентом в Firebase Storage)
export const registerFamilyMediaMessage = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");

    const { tid, storagePath, mime, size, width, height, durationSec, caption } = req.data as {
      tid: string;
      storagePath: string; // "families/{fid}/media/{tid}/{uid}/file.ext"
      mime: string;
      size?: number;
      width?: number; height?: number;
      durationSec?: number;
      caption?: string;
    };

    if (!tid || !storagePath || !mime) throw new HttpsError("invalid-argument", "tid/storagePath/mime");

    const { db, fid, famRef } = await getFamilyContext(uid);
    if (!(await isFamilyMember(famRef, uid))) throw new HttpsError("permission-denied", "Not a family member");

    await ensureGeneralThread(famRef);
    await checkRateLimit(db, uid);

    const kind = mime.startsWith("image/")
      ? "image"
      : mime.startsWith("video/")
        ? "video"
        : mime.startsWith("audio/")
          ? "audio"
          : "file";

    const tRef = famRef.collection("threads").doc(tid);
    const tDoc = await tRef.get();
    if (!tDoc.exists) throw new HttpsError("not-found", "Thread not found");

    const midRef = tRef.collection("messages").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await midRef.set({
      fromUid: uid,
      type: "media",
      media: {
        storagePath,
        mime,
        size: size ?? null,
        width: width ?? null,
        height: height ?? null,
        durationSec: durationSec ?? null,
      },
      text: caption ? sanitizeText(caption) : null,
      createdAt: now,
      editedAt: null,
      deleted: false,
      reactions: {},
    });

    await tRef.set(
      {
        updatedAt: now,
        lastMessage: { fromUid: uid, text: (caption || kind).slice(0, 120), at: now, type: "media" },
      },
      { merge: true },
    );

    return { ok: true, mid: midRef.id };
  },
);

// 5) список сообщений (пагинация назад по времени)
export const listFamilyMessages = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");

    const { tid, limit, beforeISO } = req.data as {
      tid: string; limit?: number; beforeISO?: string;
    };
    if (!tid) throw new HttpsError("invalid-argument", "tid required");

    const { db, famRef } = await getFamilyContext(uid);
    if (!(await isFamilyMember(famRef, uid))) throw new HttpsError("permission-denied", "Not a family member");

    const tRef = famRef.collection("threads").doc(tid);
    const base = tRef.collection("messages").orderBy("createdAt", "desc");

    let q = base.limit(Math.min(Math.max(limit ?? 30, 1), 100));
    if (beforeISO) {
      const b = new Date(beforeISO);
      if (!isNaN(b.getTime())) {
        q = q.where("createdAt", "<", admin.firestore.Timestamp.fromDate(b));
      }
    }
    const snap = await q.get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return { ok: true, items };
  },
);

// 6) реакции
export const addMessageReaction = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { tid, mid, emoji } = req.data as { tid: string; mid: string; emoji: string };
    if (!tid || !mid || !emoji) throw new HttpsError("invalid-argument", "tid/mid/emoji");

    const { famRef } = await getFamilyContext(uid);
    if (!(await isFamilyMember(famRef, uid))) throw new HttpsError("permission-denied", "Not a family member");

    const mRef = famRef.collection("threads").doc(tid).collection("messages").doc(mid);
    const m = await mRef.get();
    if (!m.exists) throw new HttpsError("not-found", "message");

    const key = `reactions.${emoji.replace(/\./g, "_dot_")}.${uid}`;
    await mRef.set({ [key]: true }, { merge: true });
    return { ok: true };
  },
);

export const removeMessageReaction = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { tid, mid, emoji } = req.data as { tid: string; mid: string; emoji: string };
    if (!tid || !mid || !emoji) throw new HttpsError("invalid-argument", "tid/mid/emoji");

    const { famRef } = await getFamilyContext(uid);
    if (!(await isFamilyMember(famRef, uid))) throw new HttpsError("permission-denied", "Not a family member");

    const mRef = famRef.collection("threads").doc(tid).collection("messages").doc(mid);
    const key = `reactions.${emoji.replace(/\./g, "_dot_")}.${uid}`;
    await mRef.set({ [key]: admin.firestore.FieldValue.delete() }, { merge: true });
    return { ok: true };
  },
);

// 7) read receipts: пометить тред прочитанным до времени
export const markThreadRead = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { tid, upToISO } = req.data as { tid: string; upToISO?: string };

    const { famRef } = await getFamilyContext(uid);
    if (!(await isFamilyMember(famRef, uid))) throw new HttpsError("permission-denied", "Not a family member");

    const ts = upToISO ? new Date(upToISO) : new Date();
    const valid = isNaN(ts.getTime()) ? new Date() : ts;
    await famRef
      .collection("threads")
      .doc(tid)
      .collection("participants")
      .doc(uid)
      .set(
        { lastReadAt: admin.firestore.Timestamp.fromDate(valid) },
        { merge: true },
      );
    return { ok: true };
  },
);

// 8) typing indicator
export const setTypingInThread = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { tid, typing } = req.data as { tid: string; typing: boolean };

    const { famRef } = await getFamilyContext(uid);
    if (!(await isFamilyMember(famRef, uid))) throw new HttpsError("permission-denied", "Not a family member");

    await famRef
      .collection("threads")
      .doc(tid)
      .collection("participants")
      .doc(uid)
      .set(
        { typing: !!typing, typingAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    return { ok: true };
  },
);

// 9) редактирование (в пределах 10 минут)
export const editFamilyMessage = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { tid, mid, newText } = req.data as { tid: string; mid: string; newText: string };
    if (!tid || !mid || typeof newText !== "string") throw new HttpsError("invalid-argument", "bad args");

    const { famRef } = await getFamilyContext(uid);
    const mRef = famRef.collection("threads").doc(tid).collection("messages").doc(mid);
    const m = await mRef.get();
    if (!m.exists) throw new HttpsError("not-found", "message");

    const d = m.data() as any;
    if (d.fromUid !== uid) throw new HttpsError("permission-denied", "Only author can edit");
    if (d.deleted) throw new HttpsError("failed-precondition", "Message deleted");

    const createdAt = d.createdAt?.toDate?.() as Date | undefined;
    const within = createdAt ? (Date.now() - createdAt.getTime() < 10 * 60 * 1000) : false;
    if (!within) throw new HttpsError("failed-precondition", "Edit window expired");

    const safe = sanitizeText(newText);
    await mRef.set({ text: safe, editedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
  },
);

// 10) удаление (автор или владелец семьи)
export const deleteFamilyMessage = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { tid, mid } = req.data as { tid: string; mid: string };

    const { db, fid, famRef, fam } = await getFamilyContext(uid);
    const mRef = famRef.collection("threads").doc(tid).collection("messages").doc(mid);
    const m = await mRef.get();
    if (!m.exists) throw new HttpsError("not-found", "message");

    const d = m.data() as any;
    const author = d.fromUid === uid;
    const isOwner = fam.ownerUid === uid;

    if (!author && !isOwner) throw new HttpsError("permission-denied", "Only author or owner");
    await mRef.set({ deleted: true, text: null }, { merge: true });

    // можно опционально очистить media (если это media-сообщение) — ручками из Storage по пути d.media.storagePath

    // запись в семейный журнал (не обязательно)
    await db.collection("families").doc(fid).collection("ledger").add({
      action: "chatDelete",
      actorUid: uid,
      details: { tid, mid, author, isOwner },
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true };
  },
);

/** ===================== Триггеры ===================== **/

// Пуш-уведомления всем взрослым участникам (или всем, кроме автора)
export const onFamilyMessageCreated = onDocumentCreated(
  { region: "us-east4", document: "families/{fid}/threads/{tid}/messages/{mid}" },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.deleted) return;

    const db = admin.firestore();
    const { fid, tid } = event.params as { fid: string; tid: string };

    const famRef = db.collection("families").doc(fid);
    const members = await famRef.collection("members").get();

    const notifyUids: string[] = [];
    members.forEach((m) => {
      const md = m.data() as any;
      // можно ограничить пуш только взрослым:
      // if (md.isAdult) notifyUids.push(m.id);
      // но чаще пушим всем участникам, кроме автора:
      if (m.id !== data.fromUid) notifyUids.push(m.id);
    });

    // соберём токены и пушнём
    const tokens: string[] = [];
    for (const uid of notifyUids) {
      const u = await db.collection("users").doc(uid).get();
      const tks: string[] = u.data()?.fcmTokens ?? u.data()?.expoTokens ?? [];
      tokens.push(...tks);
    }

    if (tokens.length) {
      const preview =
        data.type === "text"
          ? (data.text || "").slice(0, 80)
          : data.type === "media"
            ? (data.text || "New media")
            : "New message";
      await pushTo(tokens, "Family chat", preview, {
        kind: "chat_new_message",
        tid,
      });
    }
  },
);

import { nanoid } from "nanoid";

export const chatCreateRoom = onCall(async (req) => {
  const { familyId } = req.data ?? {};
  if (!familyId) throw new HttpsError("invalid-argument", "familyId required");
  return { ok: true, roomId: "room_" + nanoid(8) };
});

export const chatSendMessage = onCall(async (req) => {
  const { roomId, text } = req.data ?? {};
  if (!roomId || !text) throw new HttpsError("invalid-argument", "roomId & text required");
  return { ok: true, id: "msg_" + nanoid(8) };
});

export const chatFetchMessages = onCall(async (req) => {
  const { roomId } = req.data ?? {};
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  return { ok: true, items: [] };
});

// Алиасы
export { chatSendMessage as chatSendMessageCallable };
export { chatFetchMessages as chatFetchMessagesCallable };
export { chatCreateRoom as chatCreateRoomCallable };
