import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { US_REGIONS } from "../config";

/** === типы профиля ассистента === */
type AssistantTone = "child" | "teen" | "adult";
type AssistantPersona = "coach" | "psychologist" | "friend" | "default";

interface AssistantProfile {
  tone: AssistantTone;
  persona: AssistantPersona;
  remindersEnabled: boolean;
  updatedAt: FirebaseFirestore.FieldValue;
}

/** === helpers === */
async function getOrInitAssistantProfile(
  uid: string,
): Promise<AssistantProfile> {
  const db = admin.firestore();
  const ref = db
    .collection("users")
    .doc(uid)
    .collection("assistant")
    .doc("profile");
  const snap = await ref.get();
  if (!snap.exists) {
    const def: AssistantProfile = {
      tone: "adult",
      persona: "default",
      remindersEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(def);
    return def;
  }
  return snap.data() as AssistantProfile;
}

/** === API: профиль ассистента === */
export const setAssistantProfile = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { tone, persona, remindersEnabled } = req.data as {
      tone?: AssistantTone;
      persona?: AssistantPersona;
      remindersEnabled?: boolean;
    };

    const db = admin.firestore();
    const prof: Partial<AssistantProfile> = {};
    if (tone) prof.tone = tone;
    if (persona) prof.persona = persona;
    if (typeof remindersEnabled === "boolean")
      prof.remindersEnabled = remindersEnabled;
    prof.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db
      .collection("users")
      .doc(uid)
      .collection("assistant")
      .doc("profile")
      .set(prof, { merge: true });
    return { ok: true };
  },
);

export const getAssistantProfile = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const prof = await getOrInitAssistantProfile(uid);
    return { ok: true, profile: prof };
  },
);

/** === API: чат ассистента === */
export const assistantChat = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { text } = req.data as { text: string };
    if (!text || typeof text !== "string")
      throw new HttpsError("invalid-argument", "text required");

    const db = admin.firestore();
    const prof = await getOrInitAssistantProfile(uid);

    const threadRef = db
      .collection("messages_private")
      .doc(uid)
      .collection("assistant");
    const mid = threadRef.doc().id;
    await threadRef.doc(mid).set({
      role: "user",
      text,
      profile: { tone: prof.tone, persona: prof.persona },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // простая заглушка-реплай
    let reply = "";
    if (prof.persona === "coach") {
      reply = "Let's set one small, concrete step you can do today.";
    } else if (prof.persona === "psychologist") {
      reply =
        "Noted. What emotion did you feel first? Naming it often reduces intensity.";
    } else if (prof.persona === "friend") {
      reply = "I'm here. That sounds tough — want me to remind you later?";
    } else {
      reply = "Got it. I’ll keep it in mind and ping you with helpful tips.";
    }

    const rid = threadRef.doc().id;
    await threadRef.doc(rid).set({
      role: "assistant",
      text: reply,
      profile: { tone: prof.tone, persona: prof.persona },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // usage score +1
    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          usageScore: admin.firestore.FieldValue.increment(1),
          usage: {
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );

    return { ok: true, reply, mid, rid };
  },
);

/** === API: ToDo/Calendar === */
export const addTodo = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { title, dueISO } = req.data as { title: string; dueISO?: string };
    if (!title) throw new HttpsError("invalid-argument", "title required");

    const db = admin.firestore();
    const tid = db.collection("users").doc(uid).collection("todos").doc().id;
    await db
      .collection("users")
      .doc(uid)
      .collection("todos")
      .doc(tid)
      .set({
        title,
        done: false,
        dueAt: dueISO
          ? admin.firestore.Timestamp.fromDate(new Date(dueISO))
          : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { ok: true, tid };
  },
);

export const listTodos = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const snap = await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("todos")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return { ok: true, items };
  },
);

export const setTodoDone = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { id, done } = req.data as { id: string; done: boolean };
    if (!id) throw new HttpsError("invalid-argument", "id required");
    await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("todos")
      .doc(id)
      .set(
        {
          done: !!done,
          doneAt: done ? admin.firestore.FieldValue.serverTimestamp() : null,
        },
        { merge: true },
      );
    return { ok: true };
  },
);

export const addCalendarEvent = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { title, startISO, endISO } = req.data as {
      title: string;
      startISO: string;
      endISO?: string;
    };
    if (!title || !startISO)
      throw new HttpsError("invalid-argument", "title/startISO required");

    const db = admin.firestore();
    const eid = db.collection("users").doc(uid).collection("calendar").doc().id;
    await db
      .collection("users")
      .doc(uid)
      .collection("calendar")
      .doc(eid)
      .set({
        title,
        startAt: admin.firestore.Timestamp.fromDate(new Date(startISO)),
        endAt: endISO
          ? admin.firestore.Timestamp.fromDate(new Date(endISO))
          : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    return { ok: true, eid };
  },
);

export const listCalendarEvents = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const snap = await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("calendar")
      .orderBy("startAt", "asc")
      .limit(100)
      .get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return { ok: true, items };
  },
);

/** === Лидерборд использования ассистента === */
export const getFamilyUsageLeaderboard = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");

    const db = admin.firestore();
    const uDoc = await db.collection("users").doc(uid).get();
    const fid = uDoc.data()?.familyId as string | undefined;
    if (!fid) throw new HttpsError("failed-precondition", "Join family first");

    const membersSnap = await db
      .collection("families")
      .doc(fid)
      .collection("members")
      .get();
    const rows: any[] = [];
    for (const m of membersSnap.docs) {
      const u = await db.collection("users").doc(m.id).get();
      rows.push({ uid: m.id, usageScore: u.data()?.usageScore ?? 0 });
    }
    rows.sort((a, b) => b.usageScore - a.usageScore);
    return { ok: true, items: rows };
  },
);

/** === CRON: бонусы за использование (каждый день) === */
export const maybeGrantUsageRewards = onSchedule(
  { region: "us-east4", schedule: "0 6 * * *" },
  async () => {
    const db = admin.firestore();

    const users = await db.collection("users").limit(2000).get();
    for (const u of users.docs) {
      const usage = u.data()?.usageScore ?? 0;
      if (usage >= 10) {
        await db.collection("earnings").doc(u.id).collection("").add({
          reason: "assistant_usage_bonus",
          pointsAwarded: 100,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await db
          .collection("users")
          .doc(u.id)
          .set(
            {
              usageScore: Math.max(0, usage - 10),
            },
            { merge: true },
          );
      }
    }
  },
);

/** === CRON: утренний прогноз/бриф === */
export const sendDailyForecast = onSchedule(
  { region: "us-east4", schedule: "30 7 * * *" },
  async () => {
    const db = admin.firestore();
    const users = await db.collection("users").limit(2000).get();
    for (const u of users.docs) {
      const uid = u.id;
      const prof = await getOrInitAssistantProfile(uid);

      const todosSnap = await db
        .collection("users")
        .doc(uid)
        .collection("todos")
        .where("done", "==", false)
        .orderBy("createdAt", "desc")
        .limit(3)
        .get();
      const titles = todosSnap.docs
        .map((d) => d.data().title as string)
        .filter(Boolean);

      const tip =
        prof.persona === "coach"
          ? "Small steps beat big plans. Pick one task and do it now."
          : prof.persona === "psychologist"
            ? "Notice how you feel about today’s plan. Acknowledge it, then act."
            : "You’ve got this! I’m rooting for you.";

      const body = titles.length ? `Today: ${titles.join("; ")}. ${tip}` : tip;

      const tokens: string[] =
        u.data()?.fcmTokens ?? u.data()?.expoTokens ?? [];
      if (tokens.length) {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: "Your daily plan",
            body,
          },
          data: { kind: "assistant_forecast" },
        });
      }
    }
  },
);
