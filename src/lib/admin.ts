export const ADMIN_EMAILS = [
  "omer609994@gmail.com",
  "noa6660011@gmail.com",
] as const;

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase() as (typeof ADMIN_EMAILS)[number]);
}
