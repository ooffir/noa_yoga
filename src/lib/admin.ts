/**
 * Studio admin allow-list.
 *
 * Any user who signs up through Clerk with an email on this list is
 * automatically promoted to `role: "ADMIN"` on first page render
 * (see `getSharedUser()` in `src/lib/auth-helpers.ts`).
 *
 * To grant admin access in the future: add the email here, redeploy,
 * and have the new admin sign up with Clerk.
 */
export const ADMIN_EMAILS = [
  // Primary studio admin (Noa, the owner).
  "noayogaa@gmail.com",
  // Secondary admin for ongoing support + maintenance.
  "omer609994@gmail.com",
] as const;

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(
    email.toLowerCase() as (typeof ADMIN_EMAILS)[number],
  );
}
