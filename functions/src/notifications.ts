// functions/src/notifications.ts

import * as admin from "firebase-admin";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";

const db = admin.firestore();

/* -------------------------------------------------------------------------- */
/*                     EXPO PUSH NOTIFICATION SENDER                          */
/* -------------------------------------------------------------------------- */

/**
 * Отправляет push-уведомления через Expo.
 * В Node 18 fetch доступен глобально, node-fetch не нужен.
 */
async function sendExpoPush(tokens: string[], title: string, body: string) {
  if (!tokens || tokens.length === 0) return;

  const messages = tokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    priority: "high",
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });

  const json = await res.json();
  console.log("Expo push result:", json);
}

/* -------------------------------------------------------------------------- */
/*                         TASK NOTIFICATION TRIGGER                          */
/* -------------------------------------------------------------------------- */

/**
 * Запускается при создании новой задачи
 * families/{fid}/tasks/{taskId}
 */
export const notifyTaskAssigned = onDocumentCreated(
  "families/{fid}/tasks/{taskId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() as any;
    if (!data) return;

    const assignedTo: string[] = data.assignedTo ?? [];
    if (assignedTo.length === 0) return;

    console.log("TASK CREATED → assignedTo:", assignedTo);

    let allTokens: string[] = [];

    for (const uid of assignedTo) {
      const uDoc = await db.doc(`users/${uid}`).get();
      const tokens: string[] = (uDoc.get("expoTokens") as string[]) ?? [];
      if (tokens && tokens.length > 0) {
        allTokens.push(...tokens);
      }
    }

    if (allTokens.length === 0) {
      console.log("No expoTokens found → skip push");
      return;
    }

    await sendExpoPush(
      allTokens,
      "New Task Assigned",
      data.title ?? "You have a new family task"
    );
  }
);

/* -------------------------------------------------------------------------- */
/*                       GOAL PROGRESS NOTIFICATION                           */
/* -------------------------------------------------------------------------- */

/**
 * Уведомляет взрослых о прогрессе цели
 * families/{fid}/goals/{goalId}
 */
export const notifyGoalUpdated = onDocumentUpdated(
  "families/{fid}/goals/{goalId}",
  async (event) => {
    const before = event.data?.before?.data() as any | undefined;
    const after = event.data?.after?.data() as any | undefined;

    if (!before || !after) return;

    // Если прогресс не изменился — не уведомляем
    if (before.currentPoints === after.currentPoints) {
      return;
    }

    const fid = event.params.fid as string;
    console.log(`GOAL UPDATED in family ${fid}`);

    // Получаем всех членов семьи
    const membersSnap = await db
      .collection(`families/${fid}/members`)
      .get();

    const adults: string[] = [];
    membersSnap.forEach((m) => {
      if (m.get("isAdult") === true) {
        adults.push(m.id);
      }
    });

    console.log("Adult members:", adults);

    if (adults.length === 0) return;

    let allTokens: string[] = [];

    for (const uid of adults) {
      const uDoc = await db.doc(`users/${uid}`).get();
      const tokens: string[] = (uDoc.get("expoTokens") as string[]) ?? [];
      if (tokens && tokens.length > 0) {
        allTokens.push(...tokens);
      }
    }

    if (allTokens.length === 0) {
      console.log("Goal updated → no tokens");
      return;
    }

    const title = after.title ?? "Family Goal Updated";
    const progressMsg = `Goal "${title}" updated: ${after.currentPoints}/${after.targetPoints} points`;

    await sendExpoPush(allTokens, "Family Goal Updated", progressMsg);
  }
);
