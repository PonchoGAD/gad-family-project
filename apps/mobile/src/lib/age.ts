export type AgeTier = "child" | "teen" | "adult";

// birthDate — ISO "YYYY-MM-DD"
export function getAge(birthDate?: string | null, today = new Date()): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  const dob = new Date(y, (m || 1) - 1, d || 1);
  let age = today.getFullYear() - dob.getFullYear();
  const md = today.getMonth() - dob.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function getAgeTier(age: number | null): AgeTier {
  if (age === null) return "teen"; // по умолчанию мягкий режим
  if (age < 14) return "child";
  if (age < 18) return "teen";
  return "adult";
}
