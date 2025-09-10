import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { US_REGIONS } from "../config";
export { referralsCreateLink as referralsCreateLinkCallable };
export { referralsActivate as referralsActivateCallable };
export { getReferralDashboard as referralsDashboardCallable };

// ------------------------ Types & helpers ------------------------

type ReferralStatus = "active" | "blocked";
type BonusStatus = "pending" | "qualified" | "granted" | "rejected";

interface ReferralLink {
  uid: string;                // владелец ссылки (взрослый/владелец семьи)
  code: string;               // короткий код
  status: ReferralStatus;
  utm?: Record<string, string>;
  createdAt: FirebaseFirestore.FieldValue;
}

interface ClickEvent {
  code: string;
  ipHash: string | null;
  uaHash: string | null;
  ts: FirebaseFirestore.FieldValue;
}

interface SignupEvent {
  code: string;
  invitedFid: string;
  invitedOwnerUid?: string | null;
  status: BonusStatus; // pending → qualified → granted/rejected
  reason?: string | null;
  createdAt: FirebaseFirestore.FieldValue;
  decidedAt?: FirebaseFirestore.FieldValue | null;
  bonus?: {
    gad?: number;            // GAD-награда
    nft?: string | null;     // id/slug бейджа
    subDiscountMonths?: number;
  };
}

const REF_NS = "referrals";
const MAX_ACTIVE_FAMILIES_PER_MONTH = 50; // лимит активаций на семью-источник
const MIN_QUALIFY_EVENTS = 2;             // сколько базовых онбординг-событий минимум
const BONUS_GAD = 500;                     // примерная награда
const BONUS_NFT = "ambassador_badge_v1";
const BONUS_DISCOUNT_MONTHS = 1;

// короткий код
function randomCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

// грубая нормализация/хеш (не PII — только для антифрода)
function safeHash(x?: string | null) {
  if (!x) return null;
  const norm = x.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < norm.length; i++) {
    h = (h * 31 + norm.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

function monthStartUTC(d = new Date()) {
  const x = new Date(d);
  x.setUTCDate(1);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// ------------------------ API ------------------------

/**
 * Создать/получить персональную ссылку рефералки для текущего пользователя (взрослого/owner).
 * Возвращает существующую активную или создаёт новую.
 */
export const getOrCreateReferralLink = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");

    const db = admin.firestore();

    // проверяем, что пользователь — взрослый или владелец семьи
    const uDoc = await db.collection("users").doc(uid).get();
    const fid = uDoc.data()?.familyId as string | undefined;
    if (!fid) throw new HttpsError("failed-precondition", "Join family first");

    const fam = await db.collection("families").doc(fid).get();
    const isOwner = fam.data()?.ownerUid === uid;
    const mem = await fam.ref.collection("members").doc(uid).get();
    const isAdult = !!mem.data()?.isAdult;
    if (!isOwner && !isAdult) {
      throw new HttpsError("permission-denied", "Adults/owner only");
    }

    // есть активная?
    const q = await db
      .collection(REF_NS)
      .doc("links")
      .collection(uid)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (!q.empty) {
      const d = q.docs[0].data() as ReferralLink;
      return { ok: true, code: d.code, url: `https://app.example.com/i/${d.code}` };
    }

    const code = randomCode();
    const link: ReferralLink = {
      uid,
      code,
      status: "active",
      utm: req.data?.utm || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection(REF_NS).doc("links").collection(uid).doc(code).set(link);
    // индекс для обратного поиска
    await db.collection(REF_NS).doc("codes").collection("byCode").doc(code).set({
      uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, code, url: `https://app.example.com/i/${code}` };
  },
);

/**
 * Трек перехода по ссылке (когда открыли диплинк/лендинг).
 * На входе: code, ip, userAgent
 */
export const recordReferralClick = onCall(
  { region: US_REGIONS },
  async (req: any) => {
    const { code, ip, userAgent } = req.data as { code: string; ip?: string; userAgent?: string };
    if (!code) throw new HttpsError("invalid-argument", "code required");

    const db = admin.firestore();
    // проверим существование кода
    const ownerIdx = await db.collection(REF_NS).doc("codes").collection("byCode").doc(code).get();
    if (!ownerIdx.exists) throw new HttpsError("not-found", "code");

    const click: ClickEvent = {
      code,
      ipHash: safeHash(ip || req.rawRequest?.ip),
      uaHash: safeHash(userAgent || req.rawRequest?.headers["user-agent"] as string),
      ts: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection(REF_NS).doc("clicks").collection(code).add(click);
    return { ok: true };
  },
);

/**
 * Привязать регистрацию семьи к реферал-коду. Вызывается после онбординга новой семьи.
 * Вешаем событие с состоянием "pending".
 */
export const claimReferralOnSignup = onCall(
  { region: US_REGIONS },
  async (req: any) => {
    const { code, invitedFid, invitedOwnerUid } = req.data as {
      code: string;
      invitedFid: string;
      invitedOwnerUid?: string;
    };
    if (!code || !invitedFid) throw new HttpsError("invalid-argument", "code/invitedFid required");

    const db = admin.firestore();
    const ownerIdx = await db.collection(REF_NS).doc("codes").collection("byCode").doc(code).get();
    if (!ownerIdx.exists) throw new HttpsError("not-found", "code");

    // антифрод: запрет если owner сам себе
    const ownerUid = ownerIdx.data()?.uid as string;
    if (invitedOwnerUid && invitedOwnerUid === ownerUid) {
      throw new HttpsError("failed-precondition", "self-invite forbidden");
    }

    const ev: SignupEvent = {
      code,
      invitedFid,
      invitedOwnerUid: invitedOwnerUid ?? null,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection(REF_NS).doc("signups").collection(code).add(ev);

    // пинг владельца ссылки
    const ownerUser = await db.collection("users").doc(ownerUid).get();
    const tokens: string[] =
      ownerUser.data()?.fcmTokens ?? ownerUser.data()?.expoTokens ?? [];
    if (tokens?.length) {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: "Рефералка", body: "Ваша ссылка сработала, семья зарегистрировалась" },
        data: { kind: "referral_signup", code },
      });
    }

    return { ok: true };
  },
);

/**
 * Дать владельцу дашборд по ссылке: клики, регистрации, статус наград
 */
export const getReferralDashboard = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");

    const db = admin.firestore();

    // берём все активные коды пользователя
    const linksSnap = await db.collection(REF_NS).doc("links").collection(uid).get();
    const codes = linksSnap.docs
      .map((d) => (d.data() as ReferralLink).code)
      .filter(Boolean);

    const dashboard: any[] = [];
    for (const code of codes) {
      const clicksSnap = await db.collection(REF_NS).doc("clicks").collection(code).get();
      const signupsSnap = await db.collection(REF_NS).doc("signups").collection(code).get();

      const stat = {
        code,
        clicks: clicksSnap.size,
        signups: signupsSnap.size,
        bonuses: signupsSnap.docs.map((s) => {
          const x = s.data() as SignupEvent;
          return {
            id: s.id,
            status: x.status,
            invitedFid: x.invitedFid,
            decidedAt: (x.decidedAt as any) ?? null,
          };
        }),
      };
      dashboard.push(stat);
    }

    return { ok: true, items: dashboard };
  },
);

/**
 * Квалификация и выдача бонусов — крон (каждые 15 минут).
 * Условия:
 *  - не превышен месячный лимит активированных семей для владельца ссылки
 *  - у приглашённой семьи есть минимум N онбординг-событий
 *  - базовые антифрод-проверки (уникальность ipHash/uaHash/owner)
 */
export const referralsCron = onSchedule(
  { region: "us-east1", schedule: "*/15 * * * *" },
  async () => {
    const db = admin.firestore();

    // Берём последние pending-события по всем кодам
    const codesIdx = await db.collection(REF_NS).doc("codes").collection("byCode").limit(5000).get();
    for (const codeIdx of codesIdx.docs) {
      const code = codeIdx.id;
      const ownerUid = (codeIdx.data() as any).uid as string;

      const pending = await db
        .collection(REF_NS)
        .doc("signups")
        .collection(code)
        .where("status", "==", "pending")
        .limit(25)
        .get();

      if (pending.empty) continue;

      // месячный лимит
      const monthStart = monthStartUTC();
      const qualifiedThisMonth = await db
        .collection(REF_NS)
        .doc("signups")
        .collection(code)
        .where("status", "==", "granted")
        .where("createdAt", ">=", monthStart)
        .get();
      let used = qualifiedThisMonth.size;

      for (const evDoc of pending.docs) {
        if (used >= MAX_ACTIVE_FAMILIES_PER_MONTH) {
          // отклоняем из-за лимита
          await evDoc.ref.set(
            { status: "rejected", reason: "monthly_limit", decidedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true },
          );
          continue;
        }

        const ev = evDoc.data() as SignupEvent;
        const invitedFid = ev.invitedFid;

        // --- квалификация по онбордингу ---
        const invitedFamRef = db
          .collection("families")
          .doc(invitedFid) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;

        // считаем события онбординга в коллекции families/{fid}/onboardingEvents
        const evs = await invitedFamRef.collection("onboardingEvents").get();
        const types = new Set(
          evs.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ((d.data() as any).type as string) || "")
        );

        const qualifies = types.size >= MIN_QUALIFY_EVENTS;

        // --- базовый антифрод ---
        // 1) invited owner не совпадает с owner ссылки
        if (ev.invitedOwnerUid && ev.invitedOwnerUid === ownerUid) {
          await evDoc.ref.set(
            { status: "rejected", reason: "self_invite", decidedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true },
          );
          continue;
        }

        // 2) Уникальность IP/UA относительно кликов по коду (мягкая проверка)
        const clicks = await db.collection(REF_NS).doc("clicks").collection(code).get();
        const ipSet = new Set<string>();
        const uaSet = new Set<string>();
        clicks.docs.forEach((c: FirebaseFirestore.QueryDocumentSnapshot) => {
          const cd = c.data() as ClickEvent;
          if (cd.ipHash) ipSet.add(cd.ipHash);
          if (cd.uaHash) uaSet.add(cd.uaHash);
        });
        if (ipSet.size <= 1 && uaSet.size <= 1) {
          // все клики с одного IP/UA → подозрительно, отправим на ручную модерацию
          await evDoc.ref.set(
            { status: "rejected", reason: "fraud_risk", decidedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true },
          );
          continue;
        }

        if (!qualifies) {
          await evDoc.ref.set(
            { status: "qualified", decidedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true },
          );
          // ждём, когда семья дойдёт до нужного минимума (повторный прогон крона обновит)
          continue;
        }

        // --- выдача бонусов (grant) ---
        const bonus = { gad: BONUS_GAD, nft: BONUS_NFT, subDiscountMonths: BONUS_DISCOUNT_MONTHS };
        await evDoc.ref.set(
          { status: "granted", decidedAt: admin.firestore.FieldValue.serverTimestamp(), bonus },
          { merge: true },
        );

        // Журнал и кредиты пригласителю
        const ownerUser = await db.collection("users").doc(ownerUid).get();
        const tokens: string[] =
          ownerUser.data()?.fcmTokens ?? ownerUser.data()?.expoTokens ?? [];
        if (tokens?.length) {
          await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: "Реферальный бонус", body: `+${BONUS_GAD} GAD и бейдж «Ambassador»` },
            data: { kind: "referral_granted", code },
          });
        }

        // начислим GAD как “earnings”
        await db.collection("earnings").doc(ownerUid).collection("").add({
          reason: "referral_bonus",
          pointsAwarded: BONUS_GAD,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // бейдж (просто запись)
        await db.collection("users").doc(ownerUid).collection("badges").doc(BONUS_NFT).set({
          id: BONUS_NFT,
          source: "referral",
          at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        used += 1;
      }
    }
  },
);

/**
 * Топ-амбассадоры месяца — лидерборд
 */
export const referralLeaderboardMonthly = onCall(
  { region: US_REGIONS },
  async () => {
    const db = admin.firestore();
    const monthStart = monthStartUTC();

    const codesIdx = await db.collection(REF_NS).doc("codes").collection("byCode").limit(5000).get();

    const map: Record<string, number> = {}; // ownerUid -> count
    for (const c of codesIdx.docs) {
      const code = c.id;
      const ownerUid = (c.data() as any).uid as string;

      const granted = await db
        .collection(REF_NS)
        .doc("signups")
        .collection(code)
        .where("status", "==", "granted")
        .where("createdAt", ">=", monthStart)
        .get();

      map[ownerUid] = (map[ownerUid] || 0) + granted.size;
    }

    const rows = Object.entries(map)
      .map(([uid, count]) => ({ uid, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100);

    return { ok: true, items: rows };
  },
);

export const referralsCreateLink = onCall(async (req) => {
  const { uid } = req.auth ?? {};
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");
  const url = `https://gad.family/r/${uid}`;
  return { ok: true, url };
});

export const referralsActivate = onCall(async (req) => {
  const { code } = req.data ?? {};
  if (!code) throw new HttpsError("invalid-argument", "code required");
  return { ok: true };
});

//export const getReferralDashboard = onCall(async (req) => {
// const { uid } = req.auth ?? {};
//  if (!uid) throw new HttpsError("unauthenticated", "Auth required");
//  return { ok: true, stats: { clicks: 0, signups: 0, rewards: 0 } };
//});

// Алиасы (импорт в mobileV1 ждёт другое имя)

