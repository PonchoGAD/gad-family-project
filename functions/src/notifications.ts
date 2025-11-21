import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import fetch from "node-fetch";

const db = admin.firestore();

/* -------------------------------------------------------------------------- */
/*                     EXPO PUSH NOTIFICATION SENDER                          */
/* -------------------------------------------------------------------------- */

/**
 * Отправляет уведомления на массив expo push токенов.
 * Expo позволяет отправлять массивом → до 100 токенов за раз.
 */
async function sendExpoPush(tokens: string[], title: string, body: string) {
  if (tokens.length === 0) return;

  const messages = tokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    priority: "high",
  }));

  // Expo endpoint
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });

  const data = await response.json();
  console.log("Expo push response:", data);
}

/* -------------------------------------------------------------------------- */
/*                         TASK NOTIFICATION TRIGGER                          */
/* -------------------------------------------------------------------------- */

/**
 * Триггер: когда создаётся новая задача в семье.
 * families/{fid}/tasks/{taskId}
 */
export const notifyTaskAssigned = functions.firestore
  .document("families/{fid}/tasks/{taskId}")
  .onCreate(async (snap, ctx) => {
    const data = snap.data();
    if (!data) return;

    const assignedTo: string[] = data.assignedTo ?? [];
    if (assignedTo.length === 0) return;

    console.log("Task created, assignedTo:", assignedTo);

    // Собираем токены всех указанных пользователей
    let allTokens: string[] = [];

    for (const uid of assignedTo) {
      const uDoc = await db.doc(`users/${uid}`).get();
      const expoTokens: string[] = uDoc.get("expoTokens") ?? [];
      if (expoTokens.length > 0) {
        allTokens.push(...expoTokens);
      }
    }

    if (allTokens.length === 0) {
      console.log("No tokens → no push");
      return;
    }

    await sendExpoPush(
      allTokens,
      "New Task Assigned",
      data.title ?? "You have a new family task"
    );
  });

/* -------------------------------------------------------------------------- */
/*                       GOAL PROGRESS NOTIFICATION                           */
/* -------------------------------------------------------------------------- */

/**
 * Уведомляет взрослых о прогрессе цели.
 * families/{fid}/goals/{goalId}
 */
export const notifyGoalUpdated = functions.firestore
  .document("families/{fid}/goals/{goalId}")
  .onUpdate(async (change, ctx) => {
    const before = change.before.data();
    const after = change.after.data();

    if (!before || !after) return;

    if (before.currentPoints === after.currentPoints) {
      return; // прогресс не изменился
    }

    const fid = ctx.params.fid;

    // Загружаем всех взрослых
    const membersSnap = await db
      .collection(`families/${fid}/members`)
      .get();

    let adultUids: string[] = [];
    membersSnap.forEach((m) => {
      if (m.get("isAdult") === true) {
        adultUids.push(m.id);
      }
    });

    if (adultUids.length === 0) return;

    let allTokens: string[] = [];

    for (const uid of adultUids) {
      const uDoc = await db.doc(`users/${uid}`).get();
      const tokens = uDoc.get("expoTokens") ?? [];
      if (tokens.length > 0) allTokens.push(...tokens);
    }

    if (allTokens.length === 0) return;

    const text = `Goal "${after.title}" updated: ${after.currentPoints}/${after.targetPoints} points`;

    await sendExpoPush(allTokens, "Family Goal Updated", text);
  });
