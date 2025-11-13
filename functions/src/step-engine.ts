import { DateTime } from "luxon";
import * as admin from "firebase-admin";
import { DailyReward, UserProfile } from "./types.js";

const MAX_STEPS = { free: 10000, plus: 15000, pro: 20000 } as const;
const MULT = { free: 1.0, plus: 1.5, pro: 2.0 } as const;

// простая дневная ставка (пример)
function getRateForDay(d: any): number {
  const base = 0.0001;
  const w = d.weekday; // 1..7
  const factor = w >= 6 ? 1.1 : 1.0; // выходные чуть выгоднее
  return base * factor;
}

/**
 * Dry-run расчёт наград на дату (по всем пользователям)
 * ВАЖНО: summary теперь пишем в rewards/{uid} (2 сегмента, ок)
 */
export async function runDailyDryRun(
  tz = process.env.APP_TIMEZONE || "America/New_York" // США, как договорились
) {
  const db = admin.firestore();
  const now = DateTime.now().setZone(tz);
  const date = now.toFormat("yyyy-LL-dd");

  const usersSnap = await db.collection("users").get();
  const dryRun = (process.env.APP_DRY_RUN || "true") === "true";

  const batch = db.batch();
  let processed = 0;

  for (const doc of usersSnap.docs) {
    const uid = doc.id;
    const profile = (doc.data() as Partial<UserProfile>) || {};
    const plan = (profile.subscription || "free") as "free" | "plus" | "pro";

    const stepsDoc = await db.doc(`steps/${uid}/days/${date}`).get();
    const rawSteps = Number(stepsDoc.get("steps") || 0);

    const cap = MAX_STEPS[plan];
    const counted = Math.min(rawSteps, cap);

    const rateDay = getRateForDay(now);
    const multiplier = MULT[plan];
    const gad = counted * rateDay * multiplier;

    const reward: DailyReward = {
      date,
      uid,
      subscription: plan,
      stepsCounted: counted,
      multiplier,
      rateDay,
      gadEarned: gad.toFixed(6),
      dryRun,
      createdAt: Date.now(),
    };

    // rewards/{uid}/days/{date}
    const rewardRef = db.doc(`rewards/${uid}/days/${date}`);
    batch.set(rewardRef, reward, { merge: true });

    // СВОДКА — теперь в rewards/{uid} (ДВА сегмента ⇒ валидно)
    const aggRef = db.doc(`rewards/${uid}`);
    batch.set(
      aggRef,
      {
        lastDate: date,
        lastGadPreview: reward.gadEarned,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    processed++;
  }

  await batch.commit();
  return { processed, date, dryRun };
}
