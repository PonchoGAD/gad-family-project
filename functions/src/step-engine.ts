// -----------------------------------------------------------------------------
// LEGACY STEP ENGINE V1
// -----------------------------------------------------------------------------
// - used only for early dry-run / debug
// - product UI uses StepEngine V2 (stepEngineCron + stepEngineRunV2)
// - V1 читает dailySteps/{uid}/days/{date}, пишет rewards/{uid}/days/{date},
//   агрегат в rewards/{uid} и старый семейный vault/ledger.
// -----------------------------------------------------------------------------
//
// Важно:
//  - не вызывать V1 из мобильного/веб-клиента через callable;
//  - оставляем только HTTP (stepEngineRunNowHttp) и cron (stepEngineDaily)
//    как сервисные ручки для отладки и миграций.
// -----------------------------------------------------------------------------

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
 *  - families/{fid}/vault/main   ← FIX: document, а не коллекция
 *
 * Сейчас вызывается ТОЛЬКО если dryRun = false.
 * Используется только в LEGACY V1 движке.
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

  // families/{fid}/ledger/{date_uid}
  const ledgerRef = db.doc(`families/${familyId}/ledger/${ledgerId}`);

  // FIX: families/{fid}/vault/main (4 сегмента, валидный документ)
  const vaultRef = db.doc(`families/${familyId}/vault/main`);

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
 * LEGACY STEP ENGINE V1 — dry-run расчёт наград на дату (по всем пользователям).
 *
 * ВАЖНО:
 *  - шаги берём из dailySteps/{uid}/days/{date}
 *  - summary пишем в rewards/{uid} (2 сегмента, ок)
 *  - используется только:
 *      • stepEngineDaily (cron, legacy)
 *      • stepEngineRunNowHttp (HTTP, legacy debug)
 *
 * Product UI (мобильное приложение) НЕ должно вызывать V1-нагрузки.
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

  for (const docSnap of usersSnap.docs) {
    const uid = docSnap.id;
    const profile = (docSnap.data() as Partial<UserProfile>) || {};
    const plan = (profile.subscription || "free") as "free" | "plus" | "pro";

    // FIX: dailySteps/{uid}/days/{date}
    const stepsDoc = await db.doc(`dailySteps/${uid}/days/${date}`).get();
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

    // СВОДКА — в rewards/{uid} (ДВА сегмента ⇒ валидно)
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

    // Семейный сейф: пишем только в боевом режиме
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
