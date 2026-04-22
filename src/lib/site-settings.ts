import { db } from "@/lib/db";

/**
 * Reads the cancellation-window hours from SiteSettings.
 *
 * Fallback chain (first non-null wins):
 *   1. SiteSettings.cancellationWindow (admin-controlled, DB)
 *   2. process.env.CANCELLATION_HOURS_BEFORE (legacy env var)
 *   3. 6 (hard default)
 *
 * Using a helper (rather than inlining) keeps the fallback behavior
 * consistent wherever the value is consumed — the schedule page,
 * the profile page, the booking engine, and the cancel dialog all
 * end up showing the same number.
 */
export async function getCancellationWindowHours(): Promise<number> {
  try {
    const settings = await db.siteSettings.findUnique({
      where: { id: "main" },
      select: { cancellationWindow: true },
    });
    if (settings && typeof settings.cancellationWindow === "number") {
      return settings.cancellationWindow;
    }
  } catch {
    // ignore and fall through
  }

  const envValue = Number(process.env.CANCELLATION_HOURS_BEFORE);
  if (Number.isFinite(envValue) && envValue > 0) return envValue;

  return 6;
}
