// functions/src/family-age.ts
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

/**
 * Простейшая проверка формата "YYYY-MM-DD"
 */
function isValidBirthDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map((x) => parseInt(x, 10));
  if (y < 1900 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

/**
 * Рассчитать возраст в полных годах по birthDate "YYYY-MM-DD"
 */
function calcAgeYears(birthDate: string): number {
  const [y, m, d] = birthDate.split("-").map((x) => parseInt(x, 10));
  const birth = new Date(Date.UTC(y, m - 1, d));
  const now = new Date();

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const mDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Пользователь ставит себе дату рождения (черновик).
 * Дальше владелец семьи её подтверждает.
 *
 * Записываем:
 *  - users/{uid}.birthDate
 *  - если есть familyId -> families/{fid}/members/{uid}.birthDate (черновик)
 */
export const familySetBirthDate = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const { birthDate } = (req.data || {}) as { birthDate?: string };
  if (!birthDate || typeof birthDate !== "string") {
    throw new HttpsError("invalid-argument", "birthDate is required");
  }
  if (!isValidBirthDate(birthDate)) {
    throw new HttpsError("invalid-argument", "Invalid birthDate format");
  }

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();

  const data = (userSnap.exists ? userSnap.data() : {}) || {};
  const familyId = (data.familyId as string | undefined) ?? null;

  const batch = db.batch();

  batch.set(
    userRef,
    {
      birthDate,
      // isAdult/noWallet выставляются только через approve
    },
    { merge: true }
  );

  if (familyId) {
    const memberRef = db
      .collection("families")
      .doc(familyId)
      .collection("members")
      .doc(uid);

    batch.set(
      memberRef,
      {
        birthDate,
      },
      { merge: true }
    );
  }

  await batch.commit();

  return { ok: true, birthDate } as { ok: boolean; birthDate: string };
});

/**
 * Владелец семьи подтверждает возраст участника.
 *
 * Вход:
 *  - fid: familyId
 *  - memberUid: uid участника
 *
 * Проверки:
 *  - req.auth.uid == ownerUid семьи
 *  - у участника есть birthDate (в members или users)
 *
 * Вычисляем:
 *  - ageYears
 *  - isAdult = ageYears >= 18
 *  - noWallet = ageYears < 14
 *
 * Пишем:
 *  - users/{memberUid}: birthDate, isAdult, noWallet
 *  - families/{fid}/members/{memberUid}: birthDate, ageYears, isAdult, noWallet, approvedByOwner, approvedAt
 */
export const familyApproveMemberAge = onCall(async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const { fid, memberUid } = (req.data || {}) as {
    fid?: string;
    memberUid?: string;
  };

  if (!fid || !memberUid) {
    throw new HttpsError(
      "invalid-argument",
      "fid and memberUid are required"
    );
  }

  const familyRef = db.collection("families").doc(fid);
  const familySnap = await familyRef.get();
  if (!familySnap.exists) {
    throw new HttpsError("not-found", "Family not found");
  }

  const famData = familySnap.data() as any;
  const ownerUid = famData?.ownerUid as string | undefined;

  if (!ownerUid || ownerUid !== callerUid) {
    throw new HttpsError("permission-denied", "Only family owner can approve");
  }

  const memberRef = familyRef.collection("members").doc(memberUid);
  const memberSnap = await memberRef.get();

  const userRef = db.collection("users").doc(memberUid);
  const userSnap = await userRef.get();

  let birthDate: string | undefined;

  if (memberSnap.exists) {
    birthDate = (memberSnap.data() as any)?.birthDate;
  }
  if (!birthDate && userSnap.exists) {
    birthDate = (userSnap.data() as any)?.birthDate;
  }

  if (!birthDate || typeof birthDate !== "string" || !isValidBirthDate(birthDate)) {
    throw new HttpsError(
      "failed-precondition",
      "Member has no valid birthDate to approve"
    );
  }

  const ageYears = calcAgeYears(birthDate);
  const isAdult = ageYears >= 18;
  const noWallet = ageYears < 14;

  const now = admin.firestore.FieldValue.serverTimestamp();

  const batch = db.batch();

  // Обновляем профиль пользователя
  batch.set(
    userRef,
    {
      birthDate,
      isAdult,
      noWallet,
    },
    { merge: true }
  );

  // Обновляем членство в семье
  batch.set(
    memberRef,
    {
      birthDate,
      ageYears,
      isAdult,
      noWallet,
      approvedByOwner: callerUid,
      approvedAt: now,
    },
    { merge: true }
  );

  await batch.commit();

  return {
    ok: true,
    fid,
    memberUid,
    ageYears,
    isAdult,
    noWallet,
  } as {
    ok: boolean;
    fid: string;
    memberUid: string;
    ageYears: number;
    isAdult: boolean;
    noWallet: boolean;
  };
});
