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

// ─────────────────────────────────────────────────────────────────────
//  Email dispatch settings (templates + reminder timing)
// ─────────────────────────────────────────────────────────────────────

export interface EmailDispatchConfig {
  reminderHour: number;
  reminderDaysBefore: number;
  emailTemplateReminder: string;
  emailTemplatePromotion: string;
  emailTemplateCancellation: string;
}

const EMAIL_CONFIG_DEFAULTS: EmailDispatchConfig = {
  reminderHour: 9,
  reminderDaysBefore: 1,
  emailTemplateReminder: "",
  emailTemplatePromotion: "",
  emailTemplateCancellation: "",
};

/**
 * Read the full email-dispatch config in one round-trip.
 *
 * Used by:
 *   - the daily reminder cron  (needs reminderHour + days-before + template)
 *   - the booking engine        (needs promotion + cancellation templates)
 *
 * All fields are null-safe: if the row is missing or a column isn't
 * populated yet (e.g. during the window between deploying code and
 * applying the SQL migration), we fall back to empty strings and sensible
 * numeric defaults. Empty templates trigger the hardcoded fallback inside
 * src/lib/email.ts.
 */
export async function getEmailDispatchConfig(): Promise<EmailDispatchConfig> {
  try {
    const settings = await db.siteSettings.findUnique({
      where: { id: "main" },
      select: {
        reminderHour: true,
        reminderDaysBefore: true,
        emailTemplateReminder: true,
        emailTemplatePromotion: true,
        emailTemplateCancellation: true,
      },
    });
    if (!settings) return EMAIL_CONFIG_DEFAULTS;

    return {
      reminderHour:
        typeof settings.reminderHour === "number" ? settings.reminderHour : 9,
      reminderDaysBefore:
        typeof settings.reminderDaysBefore === "number"
          ? settings.reminderDaysBefore
          : 1,
      emailTemplateReminder: settings.emailTemplateReminder ?? "",
      emailTemplatePromotion: settings.emailTemplatePromotion ?? "",
      emailTemplateCancellation: settings.emailTemplateCancellation ?? "",
    };
  } catch (err) {
    console.error("[site-settings] email config read failed:", err);
    return EMAIL_CONFIG_DEFAULTS;
  }
}

