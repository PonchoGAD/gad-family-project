// apps/mobile/src/lib/age.ts
// ---------------------------------------------------------------
// Age helpers for user profile / geolocation policy
//  - getAge: age in full years from DOB string
//  - getAgeTier: maps numeric age to policy tier
//  - isAdultFromAge: convenience boolean
//  - getUserAgeInfo: reads age info from users/{uid} (DOB / ageYears / isAdult)
// ---------------------------------------------------------------

import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

export type AgeTier = "child" | "teen" | "adult";

export type UserAgeInfo = {
  uid: string;
  birthDate: string | null; // "YYYY-MM-DD" или null
  ageYears: number | null; // возраст в полных годах
  tier: AgeTier; // child / teen / adult
  isAdult: boolean | null; // итоговый флаг 18+ (с учётом профиля и вычислений)
};

/**
 * Calculate age in full years from ISO "YYYY-MM-DD" birth date.
 */
export function getAge(
  birthDate?: string | null,
  today = new Date()
): number | null {
  if (!birthDate) return null;

  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y) return null;

  const dob = new Date(y, (m || 1) - 1, d || 1);
  let age = today.getFullYear() - dob.getFullYear();

  const md = today.getMonth() - dob.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

/**
 * Map numeric age to a policy tier used in app logic.
 */
export function getAgeTier(age: number | null): AgeTier {
  if (age === null) return "teen"; // мягкий дефолт
  if (age < 14) return "child";
  if (age < 18) return "teen";
  return "adult";
}

/**
 * Convenience helper: convert numeric age to "is adult" flag.
 *  - null → null (неизвестно / не подтверждено)
 */
export function isAdultFromAge(age: number | null): boolean | null {
  if (age === null) return null;
  return age >= 18;
}

/**
 * Read age info from users/{uid}.
 *
 * Приоритет:
 *  1) birthDate → вычисляем ageYears
 *  2) если ageYears уже сохранён — используем как fallback
 *  3) isAdult из профиля имеет приоритет над вычислением по возрасту
 *
 * Возвращаем единый объект UserAgeInfo:
 *  - uid
 *  - birthDate
 *  - ageYears
 *  - tier (child/teen/adult)
 *  - isAdult (true/false/null)
 */
export async function getUserAgeInfo(
  uid?: string
): Promise<UserAgeInfo | null> {
  const effUid = uid ?? auth.currentUser?.uid;
  if (!effUid) return null;

  const ref = doc(db, "users", effUid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Пользователь есть в Auth, но ещё нет профиля в users/{uid}
    const baseAge: UserAgeInfo = {
      uid: effUid,
      birthDate: null,
      ageYears: null,
      tier: "teen",
      isAdult: null,
    };
    return baseAge;
  }

  const data = snap.data() as any;

  const birthDate: string | null =
    typeof data.birthDate === "string" ? data.birthDate : null;

  const storedAgeYears: number | null =
    typeof data.ageYears === "number" ? data.ageYears : null;

  const computedAge = getAge(birthDate) ?? storedAgeYears;
  const tier = getAgeTier(computedAge);

  // isAdult: приоритет у явного флага из профиля
  let isAdult: boolean | null;
  if (data.isAdult === true) {
    isAdult = true;
  } else if (data.isAdult === false) {
    isAdult = false;
  } else {
    isAdult = isAdultFromAge(computedAge);
  }

  const info: UserAgeInfo = {
    uid: effUid,
    birthDate,
    ageYears: computedAge,
    tier,
    isAdult,
  };

  return info;
}
