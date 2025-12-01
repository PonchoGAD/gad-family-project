// functions/src/stepPushes.ts
// -------------------------------------------------------------
// STEP ENGINE V2 — PUSH NOTIFICATIONS
// -------------------------------------------------------------
// Событие: rewards/{uid}/days/{date}
// Отправляет пуш: "You earned X GAD today!"
// -------------------------------------------------------------

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { sendPushToUser } from "./notifications.js";

export const onStepReward = onDocumentCreated(
  "rewards/{uid}/days/{date}",
  async (event) => {
    const { uid } = event.params;
    const reward = event.data?.data();

    if (!reward) return;

    logger.info(`[stepPushes] New reward for ${uid}:`, reward);

    const earned = reward.gadEarned ?? reward.points ?? 0;

    await sendStepRewardAlert(uid, earned);
  }
);

export async function sendStepRewardAlert(uid: string, amount: number) {
  const body = amount > 0
    ? `You earned ${amount} GAD today! Keep going!`
    : `No GAD earned today — keep walking!`;

  await sendPushToUser(uid, {
    title: "Daily Reward",
    body,
    data: {
      type: "step_reward",
      amount,
    },
  });
}
