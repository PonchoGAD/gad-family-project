// apps/mobile/src/lib/age.ts

export type AgeTier = "child" | "teen" | "adult";

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
  if (age === null) return "teen"; // soft default
  if (age < 14) return "child";
  if (age < 18) return "teen";
  return "adult";
}
