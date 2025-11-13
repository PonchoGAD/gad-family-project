import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { US_REGIONS } from "../config";
export {
  alarmUpsert as alarmUpsertCallable,
  alarmPreview as alarmPreviewCallable
} from "./alarm.js";


/**
 * Структура:
 * users/{uid}/alarms/{aid}:
 *  - title, timeHHmm, tz, daysOfWeek[0-6], enabled, profile("school"|"work"|"weekend"),
 *  - sound, vibrate, rampUp, silentWeeks[], dndUntilISO, lastTriggeredISO, createdAt, updatedAt
 *
 * users/{uid}/assistantBriefs/{bid}:
 *  - kind: "evening"|"morning"
 *  - text, items:{weather,calendar,todos,tip}, voice:boolean, createdAt
 *
 * users/{uid}/preferences/alarm:
 *  - voice:boolean, childMode:boolean, style:"friendly"|"formal"|"playful"
 *  - eveningPreviewHour (0..23)
 */

type AlarmProfile = "school" | "work" | "weekend";
type BriefKind = "evening" | "morning";

interface Alarm {
  title: string;
  timeHHmm: string;                // "07:30"
  tz: string;                      // "Europe/Moscow"
  daysOfWeek: number[];            // 0..6 (Mon..Sun or Sun..Sat — выбери единый формат, здесь 0=Mon)
  enabled: boolean;
  profile: AlarmProfile;
  sound?: string | null;
  vibrate?: boolean;
  rampUp?: boolean;
  silentWeeks?: string[];          // YYYY-Www (ISO week)
  dndUntilISO?: string | null;
  lastTriggeredISO?: string | null;
  createdAt: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
}

function nowISO() { return new Date().toISOString(); }
async function getUidOrFail(req: any) {
  const uid = req?.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");
  return uid;
}

async function fetchTodosCalendarWeather(uid: string) {
  const db = admin.firestore();
  // TODO: подключить реальные погодные данные. В MVP возвращаем пустышку с нейтральными советами
  const weather = { summary: "Погода: проверьте осадки перед выходом", tempC: null, advice: "Возьмите воду и зарядку." };

  const todosSnap = await db.collection("users").doc(uid).collection("todos")
    .where("done", "==", false).orderBy("createdAt", "desc").limit(5).get();
  const todos = todosSnap.docs.map(d => (d.data().title as string)).filter(Boolean);

  const calSnap = await db.collection("users").doc(uid).collection("calendar")
    .orderBy("startAt", "asc").limit(5).get();
  const calendar = calSnap.docs.map(d => {
    const x = d.data() as any;
    return { title: x.title, startAt: x.startAt?.toDate?.()?.toISOString?.() ?? null, location: x.location ?? null };
  });

  return { weather, todos, calendar };
}

function makeMotivation(style: "friendly" | "formal" | "playful", profile: AlarmProfile) {
  const base =
    style === "formal"
      ? "План на сегодня готов. Действуйте последовательно."
      : style === "playful"
      ? "Погнали! Сегодня берём маленькую победу 🚀"
      : "Ты справишься! Начни с одного шага 👍";
  const suffix =
    profile === "school" ? "Не забудь тетрадь и воду." :
    profile === "work"   ? "Проверь важные встречи и документы." :
                           "Запланируй прогулку и отдых.";
  return `${base} ${suffix}`;
}

/** === CRUD: создать будильник === */
export const createAlarm = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = await getUidOrFail(req);
    const { title, timeHHmm, tz, daysOfWeek, profile, sound, vibrate, rampUp } = req.data as Partial<Alarm> & { timeHHmm: string; tz: string; daysOfWeek: number[]; profile: AlarmProfile };
    if (!title || !timeHHmm || !tz || !Array.isArray(daysOfWeek) || !profile)
      throw new HttpsError("invalid-argument", "title/timeHHmm/tz/days/profile");

    const a: Alarm = {
      title,
      timeHHmm,
      tz,
      daysOfWeek,
      enabled: true,
      profile,
      sound: sound ?? null,
      vibrate: !!vibrate,
      rampUp: !!rampUp,
      silentWeeks: [],
      dndUntilISO: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = admin.firestore().collection("users").doc(uid).collection("alarms").doc();
    await ref.set(a);
    return { ok: true, aid: ref.id };
  },
);

/** === CRUD: обновить будильник === */
export const updateAlarm = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = await getUidOrFail(req);
    const { id, patch } = req.data as { id: string; patch: Partial<Alarm> };
    if (!id) throw new HttpsError("invalid-argument", "id");
    const ref = admin.firestore().collection("users").doc(uid).collection("alarms").doc(id);
    const p: any = { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    await ref.set(p, { merge: true });
    return { ok: true };
  },
);

/** === CRUD: удалить будильник === */
export const deleteAlarm = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = await getUidOrFail(req);
    const { id } = req.data as { id: string };
    if (!id) throw new HttpsError("invalid-argument", "id");
    await admin.firestore().collection("users").doc(uid).collection("alarms").doc(id).delete();
    return { ok: true };
  },
);

/** === Список будильников === */
export const listAlarms = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = await getUidOrFail(req);
    const snap = await admin.firestore().collection("users").doc(uid).collection("alarms").orderBy("createdAt", "desc").limit(100).get();
    const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    return { ok: true, items };
  },
);

/** === Включить/выключить DND до времени X === */
export const setAlarmDND = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = await getUidOrFail(req);
    const { untilISO } = req.data as { untilISO: string | null };
    await admin.firestore().collection("users").doc(uid).collection("preferences").doc("alarm").set(
      { dndUntilISO: untilISO ?? null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { ok: true };
  },
);

/** === Вечерний превью (cron, 19:30 по UTC, подстрой под свою зону) === */
export const eveningPreview = onSchedule(
  { region: "us-east1", schedule: "30 19 * * *" },
  async () => {
    const db = admin.firestore();
    const users = await db.collection("users").limit(2000).get();
    for (const u of users.docs) {
      const uid = u.id;
      const { weather, todos, calendar } = await fetchTodosCalendarWeather(uid);
      const prefDoc = await db.collection("users").doc(uid).collection("preferences").doc("alarm").get();
      const style = (prefDoc.data()?.style as "friendly" | "formal" | "playful") || "friendly";
      const profile: AlarmProfile = "work";
      const tip = makeMotivation(style, profile);

      const text = `Завтра: ${todos.slice(0,3).join("; ") || "свободно"} • Проверь погоду. ${tip}`;
      await db.collection("users").doc(uid).collection("assistantBriefs").add({
        kind: "evening",
        text,
        items: { weather, todos, calendar, tip },
        voice: !!prefDoc.data()?.voice,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const tokens: string[] = u.data()?.fcmTokens ?? u.data()?.expoTokens ?? [];
      if (tokens.length) {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title: "Вечерний превью", body: text },
          data: { kind: "alarm_evening" },
        });
      }
    }
  },
);

/** === Утренний бриф: вызывать при срабатывании будильника клиентом === */
export const morningBriefOnAlarm = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = await getUidOrFail(req);
    const { alarmId } = req.data as { alarmId: string };
    if (!alarmId) throw new HttpsError("invalid-argument", "alarmId");

    const db = admin.firestore();
    const aDoc = await db.collection("users").doc(uid).collection("alarms").doc(alarmId).get();
    if (!aDoc.exists) throw new HttpsError("not-found", "alarm");
    const a = aDoc.data() as Alarm;

    // DND: если установлен — не будим
    const pref = await db.collection("users").doc(uid).collection("preferences").doc("alarm").get();
    const dndUntil = pref.data()?.dndUntilISO ? new Date(pref.data()!.dndUntilISO) : null;
    if (dndUntil && dndUntil.getTime() > Date.now())
      return { ok:true, suppressed:true };

    const { weather, todos, calendar } = await fetchTodosCalendarWeather(uid);
    const style = (pref.data()?.style as "friendly" | "formal" | "playful") || "friendly";
    const tip = makeMotivation(style, a.profile);

    const text = `Доброе утро! ${weather.summary}. Важное сегодня: ${calendar[0]?.title ?? "свободно"}. ${tip}`;
    await db.collection("users").doc(uid).collection("assistantBriefs").add({
      kind: "morning",
      text,
      items: { weather, todos, calendar, tip },
      voice: !!pref.data()?.voice,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await aDoc.ref.set({ lastTriggeredISO: nowISO() }, { merge: true });

    const tokens: string[] = (await db.collection("users").doc(uid).get()).data()?.fcmTokens ?? [];
    if (tokens.length) {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: a.title || "Будильник", body: text },
        data: { kind: "alarm_morning", alarmId },
      });
    }
    return { ok:true, text };
  },
);

export const alarmUpsert = onCall(async (req) => {
  const { id, when, payload } = req.data ?? {};
  if (!when) throw new HttpsError("invalid-argument", "when required");
  // TODO: schedule/update job
  return { ok: true, id: id ?? "alarm_mock" };
});

export const alarmPreview = onCall(async (req) => {
  const { when } = req.data ?? {};
  if (!when) throw new HttpsError("invalid-argument", "when required");
  return { ok: true, preview: { when, message: "Alarm preview" } };
});

// Алиасы

