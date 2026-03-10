/**
 * Family Feature - Shared Utilities
 */

export const ROLE_LABELS: Record<string, string> = {
  owner: "소유자",
  guardian: "보호자",
  therapist: "치료사",
  viewer: "조회자",
};

export function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
