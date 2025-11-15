// functions/src/step-engine.ts
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
 * Пишем агрегированные данные в семейный сейф:
 *  - families/{fid}/ledger/{date_uid}
 *  - families/{fid}/vault
 *
 * Сейчас вызывается ТОЛЬКО если dryRun = false.
 */
async function writeFamilyLedgerAndVault(
  db: FirebaseFirestore.Firestore,
  uid: string,
  date: string,
  gadPoints: number
) {
  if (!gadPoints || gadPoints <= 0) return;

  // 1) читаем familyId из users/{uid}
  const userSnap = await db.doc(`users/${uid}`).get();
  const familyId = (userSnap.data() as any)?.familyId as string | undefined;

  if (!familyId) return;

  const ledgerId = `${date}_${uid}`;
  const ledgerRef = db.doc(`families/${familyId}/ledger/${ledgerId}`);
  const vaultRef = db.doc(`families/${familyId}/vault`);

  // 2) запись в ledger
  await ledgerRef.set(
    {
      uid,
      date,
      points: gadPoints,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // 3) инкремент агрегированного vault
  await vaultRef.set(
    {
      totalLockedPoints: admin.firestore.FieldValue.increment(gadPoints),
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
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
  const ledgerOps: Promise<unknown>[] = [];
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

    // Задел под семейный сейф: пишем только в боевом режиме
    if (!dryRun && gad > 0) {
      ledgerOps.push(writeFamilyLedgerAndVault(db, uid, date, gad));
    }

    processed++;
  }

  await batch.commit();

  if (ledgerOps.length) {
    await Promise.all(ledgerOps);
  }

  return { processed, date, dryRun };
}
