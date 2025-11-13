import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { US_REGIONS } from "../config";
import { spendGasReserveInternal, getFamilyPlanQuick, PLAN_GAS_SCALE, Plan } from "./plans";

/**
 * Цели модуля:
 * - Отдельный неснимаемый газ-резерв (BNB)
 * - История: CREDIT/DEBIT, причина, метаданные
 * - Пороговые сигналы и рекомендации по экономии/апгрейду тарифа
 */

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

/** === API: текущее состояние газ-резерва === */
export const getGasBalance = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { famRef } = await getFamilyContext(uid);
    const sub = await famRef.collection("billing").doc("subscription").get();
    const gasReserveBNB = sub.data()?.gasReserveBNB ?? 0;
    return { ok:true, gasReserveBNB };
  },
);

/** === API: история операций газа === */
export const getGasLedger = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { famRef } = await getFamilyContext(uid);
    const snap = await famRef.collection("gasLedger").orderBy("at","desc").limit(200).get();
    const items = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) }));
    return { ok:true, items };
  },
);

/** === API: настройки оповещений и порогов === */
export const setGasAlerts = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { lowPct, criticalPct } = req.data as { lowPct?: number; criticalPct?: number };
    const { famRef } = await getFamilyContext(uid);
    await famRef.collection("billing").doc("gasAlerts").set({
      lowPct: typeof lowPct === "number" ? Math.max(1, Math.min(99, lowPct)) : 20,
      criticalPct: typeof criticalPct === "number" ? Math.max(1, Math.min(99, criticalPct)) : 10,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge:true });
    return { ok:true };
  },
);

/** === SYSTEM API: списать газ (используй из ончейн-операций) === */
export const spendGasReserve = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { amountBNB, reason } = req.data as { amountBNB:number; reason:string };
    if (!amountBNB || amountBNB <= 0) throw new HttpsError("invalid-argument","amountBNB > 0");
    const { db, fid } = await getFamilyContext(uid);

    await spendGasReserveInternal(db, fid, amountBNB, reason || "op");

    return { ok:true };
  },
);

/** === Инциденты: лог аномально высоких списаний (ручная подача) === */
export const logGasIncident = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req:any) => {
    const uid = req.auth?.uid; if (!uid) throw new HttpsError("unauthenticated","Auth required");
    const { message, amountBNB } = req.data as { message:string; amountBNB?:number };
    const { famRef } = await getFamilyContext(uid);
    await famRef.collection("gasIncidents").add({
      byUid: uid,
      message,
      amountBNB: amountBNB ?? null,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok:true };
  },
);

/** === CRON: ежедневный мониторинг уровня резерва и рекомендации === */
export const gasHealthMonitor = onSchedule(
  { region: "us-east1", schedule: "20 5 * * *" },
  async () => {
    const db = admin.firestore();
    const fams = await db.collection("families").get();
    for (const f of fams.docs) {
      const fid = f.id;
      const sub = await f.ref.collection("billing").doc("subscription").get();
      const alerts = await f.ref.collection("billing").doc("gasAlerts").get();

      const gas = sub.data()?.gasReserveBNB ?? 0;
      const lowPct = alerts.data()?.lowPct ?? 20;
      const criticalPct = alerts.data()?.criticalPct ?? 10;

      // грубо: определяем «полный» месячный резерв как сумма кредитов за 60 дней / 2
      const ledger = await f.ref.collection("gasLedger").orderBy("at", "desc").limit(400).get();
      let totalCredits = 0;
      ledger.forEach(d => { if (d.data().type === "CREDIT") totalCredits += Number(d.data().stipendBNB || 0); });
      const baseline = totalCredits > 0 ? totalCredits / 2 : 0.1; // fallback

      const pct = baseline > 0 ? Math.floor((gas / baseline) * 100) : 100;
      const ownerUid = (await f.ref.get()).data()?.ownerUid as string | undefined;
      if (!ownerUid) continue;
      const owner = await db.collection("users").doc(ownerUid).get();
      const tokens: string[] = owner.data()?.fcmTokens ?? owner.data()?.expoTokens ?? [];

      if (pct <= criticalPct) {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title: "Газ-резерв критически низкий", body: "Рекомендуем пополнить или сократить операции." },
          data: { kind: "gas_critical" },
        });
      } else if (pct <= lowPct) {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title: "Газ-резерв на исходе", body: "Подумайте об апгрейде плана или объединяйте операции." },
          data: { kind: "gas_low" },
        });
      }

      // рекомендация апгрейда по хронической нехватке
      const plan = await getFamilyPlanQuick(db, fid);
      if (pct <= lowPct && plan !== "PRO") {
        await f.ref.collection("gasSuggestions").add({
          kind: "upgrade",
          fromPlan: plan,
          at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  },
);
