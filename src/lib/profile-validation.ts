/**
 * Shared profile-completeness rules.
 *
 * Used by:
 *   - The server-side gate on /api/bookings, /api/admin/users, the
 *     PayMe credit/workshop server actions — to block the action and
 *     return a `requiresProfile: true` flag.
 *   - The client-side gate on Schedule, Workshops, Pricing — to open
 *     the profile-completion modal proactively before firing the
 *     network request (better UX than a round-trip rejection).
 *
 * Single source of truth so both sides agree on what "complete" means.
 */

const NAME_MIN_LENGTH = 2;

// Israeli mobile numbers are 10 digits including the leading 0
// (e.g. 0501234567). We're tolerant of:
//   - +972 prefix (e.g. +972501234567 → 12 chars)
//   - dashes / spaces inserted by the user
// Validation is intentionally minimal — we don't want to block someone
// from a legitimate landline or international number. We only require
// "looks vaguely like a phone, has at least 9 digits".
const PHONE_DIGIT_MIN = 9;

export function isNameValid(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.trim().length >= NAME_MIN_LENGTH;
}

export function isPhoneValid(phone: string | null | undefined): boolean {
  if (!phone) return false;
  // Strip everything that isn't a digit and count.
  const digits = phone.replace(/\D/g, "");
  return digits.length >= PHONE_DIGIT_MIN;
}

export function isProfileComplete(
  user: { name?: string | null; phone?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  return isNameValid(user.name) && isPhoneValid(user.phone);
}

/**
 * Common HTTP response when an action is blocked because the profile
 * isn't complete. Returned with `status: 422` so the client can
 * distinguish from a generic 400/500 and open the profile modal.
 */
export const PROFILE_INCOMPLETE_RESPONSE = {
  error: "יש להשלים את פרטי הפרופיל (שם וטלפון) לפני המשך הפעולה",
  requiresProfile: true,
} as const;
