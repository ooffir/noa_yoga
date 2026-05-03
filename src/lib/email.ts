import nodemailer from "nodemailer";

/**
 * Centralized email dispatch for Noa Yogis.
 *
 * Two public send functions:
 *   - sendTransactionalEmail()  — always fires. Use for payment receipts,
 *     sign-up confirmations, password resets — anything legally or
 *     functionally required regardless of user preferences.
 *   - sendMarketingEmail(user)  — fires only if `user.receiveEmails === true`.
 *     Use for booking confirmations, waitlist promotions, reminders —
 *     anything the user can reasonably opt out of.
 *
 * All templates share a common Hebrew RTL wrapper (`renderEmail`) so the
 * look is consistent across booking confirmations, receipts, etc.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Nodemailer transport
// ─────────────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface UserLite {
  email: string;
  receiveEmails: boolean;
}

// Studio's primary contact email — used as default `from` + `reply-to`
// header. If a user replies to any system email, the reply lands in
// noayogaa@gmail.com.
const STUDIO_EMAIL = "noayogaa@gmail.com";
const EMAIL_FROM =
  process.env.EMAIL_FROM || `Noa Yogis <${STUDIO_EMAIL}>`;
const REPLY_TO = STUDIO_EMAIL;

/**
 * Always sends. Use for transactional / legally-required emails.
 */
export async function sendTransactionalEmail({ to, subject, html }: EmailOptions) {
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      replyTo: REPLY_TO,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("[email] transactional send failed:", error);
  }
}

/**
 * Fires only if the user has opted in. Returns silently otherwise.
 */
export async function sendMarketingEmail(
  user: UserLite,
  { subject, html }: Omit<EmailOptions, "to">,
) {
  if (!user.receiveEmails) {
    return; // respects opt-out, no error path
  }
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      replyTo: REPLY_TO,
      to: user.email,
      subject,
      html,
    });
  } catch (error) {
    console.error("[email] marketing send failed:", error);
  }
}

/**
 * Backwards-compatible raw sender. Retained for any callers not yet using
 * the new transactional/marketing split. Prefer the specific helpers above.
 */
export async function sendEmail({ to, subject, html }: EmailOptions) {
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      replyTo: REPLY_TO,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("[email] send failed:", error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared HTML wrapper — Hebrew RTL + sage palette + studio footer
// ─────────────────────────────────────────────────────────────────────────────
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://noa-yoga.vercel.app";
const WHATSAPP_URL = "https://chat.whatsapp.com/F0VZnlRRPbg9td08thtOjK";

const SAGE_600 = "#587b5b"; // primary
const SAGE_100 = "#e7eee6";
const SAGE_50 = "#f4f7f4";
const SAGE_900 = "#2c3a2d";
const SAGE_500 = "#7a9b7d";
const SAND_50 = "#faf7f2";

interface WrapperOptions {
  title: string;
  intro: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

function renderEmail({
  title,
  intro,
  body,
  ctaLabel,
  ctaUrl,
}: WrapperOptions): string {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${SAND_50};font-family:Arial,'Varela Round','Assistant',sans-serif;direction:rtl;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND_50};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${SAGE_100};border-radius:24px;overflow:hidden;direction:rtl;text-align:right;">
            <tr>
              <td style="padding:32px 32px 0 32px;">
                <div style="color:${SAGE_600};font-size:13px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">Noa Yogis</div>
                <h1 style="margin:8px 0 16px 0;color:${SAGE_900};font-size:22px;line-height:1.3;font-weight:700;">${escapeHtml(title)}</h1>
                <p style="margin:0 0 20px 0;color:${SAGE_500};font-size:15px;line-height:1.7;">
                  ${intro}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <div style="background:${SAGE_50};border:1px solid ${SAGE_100};border-radius:16px;padding:20px;">
                  ${body}
                </div>
              </td>
            </tr>
            ${
              ctaLabel && ctaUrl
                ? `
            <tr>
              <td style="padding:24px 32px 8px 32px;" align="center">
                <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${SAGE_600};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:16px;">
                  ${escapeHtml(ctaLabel)}
                </a>
              </td>
            </tr>`
                : ""
            }
            <tr>
              <td style="padding:28px 32px 32px 32px;">
                <div style="border-top:1px solid ${SAGE_100};padding-top:20px;color:${SAGE_500};font-size:12px;line-height:1.7;text-align:center;">
                  <strong style="color:${SAGE_900};">Noa Yogis</strong> · סטודיו ליוגה ותנועה
                  <br />
                  <a href="${SITE_URL}" style="color:${SAGE_600};text-decoration:none;">האתר</a>
                  &nbsp;·&nbsp;
                  <a href="${WHATSAPP_URL}" style="color:${SAGE_600};text-decoration:none;">קבוצת הווצאפ</a>
                  &nbsp;·&nbsp;
                  <a href="${SITE_URL}/profile" style="color:${SAGE_600};text-decoration:none;">העדפות מייל</a>
                  <br /><br />
                  <span style="color:#a9b4a7;font-size:11px;">
                    קיבלת את המייל הזה כי נרשמת ל-Noa Yogis. ניתן לבטל קבלת מיילים תפעוליים מכל עמוד האזור האישי שלך באתר.
                  </span>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─────────────────────────────────────────────────────────────────────────────
//  Admin-template formatter
//
//  Resolves {{variable}} placeholders against a data bag and converts the
//  resulting text to safe HTML with:
//    - paragraph breaks on blank lines
//    - <br/> on single newlines
//    - **bold** → <strong>
//
//  NOTE: unknown variables are kept as a visible `{{missing}}` tag rather
//  than silently stripped — that way Noa can see her own typos in a test
//  send rather than discovering them after hundreds of deliveries.
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateData = Record<string, string | number | null | undefined>;

/**
 * Replace `{{var}}` placeholders in a raw template with values from `data`.
 * Returns the resolved *text* (still escaped when piped through our HTML
 * renderers).
 */
export function formatEmail(template: string, data: TemplateData): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    const v = data[key];
    if (v === undefined || v === null || v === "") return full; // leave {{key}}
    return String(v);
  });
}

/**
 * Turn a raw plain-text / light-markdown body into the inner HTML of an
 * email — safe for injecting into the sage wrapper in `renderEmail()`.
 *
 * Rules:
 *   - HTML entities are escaped FIRST, so author `<script>` can't execute.
 *   - Blank line (`\n\n`) separates paragraphs (`<p>...</p>`).
 *   - Single `\n` inside a paragraph becomes `<br/>`.
 *   - `**text**` becomes `<strong>text</strong>`.
 */
function renderAuthorBodyHtml(text: string): string {
  const escaped = escapeHtml(text.trim());
  const paragraphs = escaped
    .split(/\n{2,}/) // blank line = paragraph break
    .map((p) => p.trim())
    .filter(Boolean);

  const html = paragraphs
    .map((p) => {
      const withBreaks = p.replace(/\n/g, "<br/>");
      const withBold = withBreaks.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return `<p style="margin:0 0 12px 0;color:${SAGE_900};font-size:14px;line-height:1.7;">${withBold}</p>`;
    })
    .join("");

  return html || `<p style="margin:0;color:${SAGE_900};font-size:14px;">&nbsp;</p>`;
}

/**
 * Build a full email from an admin-provided template body. Wraps the
 * author's text in the studio's sage HTML wrapper + footer so even the
 * customised email still looks like the rest of the studio's brand.
 *
 * If `template` is empty/whitespace, returns `null` so the caller can
 * fall back to the built-in hardcoded template.
 */
export function renderAdminTemplateEmail(params: {
  template: string;
  data: TemplateData;
  title: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): { html: string } | null {
  const resolved = formatEmail(params.template, params.data).trim();
  if (!resolved) return null;

  const bodyHtml = renderAuthorBodyHtml(resolved);

  // We use `renderEmail` but stuff the entire author body into `body` and
  // leave `intro` empty. Gives the admin full control of the wording.
  const html = renderEmail({
    title: params.title,
    intro: "",
    body: bodyHtml,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
  });
  return { html };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Template A — Payment Receipt (transactional, ALWAYS sent)
// ─────────────────────────────────────────────────────────────────────────────
export interface PaymentReceiptParams {
  name: string;
  productLabel: string; // e.g. "כרטיסיית 10 שיעורים", "שיעור בודד", "סדנה: ..."
  amountIls: number;
  date: Date;
  transactionId: string; // PayMe sale code
}

export function paymentReceiptEmail(p: PaymentReceiptParams) {
  const formattedDate = formatHebrewDate(p.date);
  const formattedAmount = `${p.amountIls.toLocaleString("he-IL", {
    maximumFractionDigits: 2,
  })} ₪`;

  const body = `
    <div style="margin-bottom:12px;color:${SAGE_900};font-size:14px;font-weight:700;">פרטי רכישה:</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${SAGE_900};font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};width:110px;">מוצר</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.productLabel)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">סכום</td>
        <td style="padding:4px 0;font-weight:600;">${formattedAmount}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">תאריך</td>
        <td style="padding:4px 0;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">אישור עסקה</td>
        <td style="padding:4px 0;font-family:monospace;font-size:12px;color:${SAGE_500};">${escapeHtml(p.transactionId)}</td>
      </tr>
    </table>
  `;

  return {
    subject: `תודה! אישור תשלום עבור ${p.productLabel} — Noa Yogis`,
    html: renderEmail({
      title: "אישור תשלום",
      intro: `היי ${escapeHtml(p.name)}, איזה כיף שהצטרפת אלינו! הקרדיטים עודכנו בחשבונך ואת מוזמנת להתחיל להירשם לשיעורים הקרובים.`,
      body,
      ctaLabel: "הרשמה לשיעור",
      ctaUrl: `${SITE_URL}/schedule`,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Template B — Booking Confirmation (marketing / opt-outable)
// ─────────────────────────────────────────────────────────────────────────────
export interface BookingConfirmationParams {
  name: string;
  className: string;
  date: Date;
  startTime: string; // HH:MM
  cancellationHours: number;
}

export function bookingConfirmationEmail(p: BookingConfirmationParams) {
  const formattedDate = formatHebrewDate(p.date);

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${SAGE_900};font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};width:80px;">השיעור</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.className)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">תאריך</td>
        <td style="padding:4px 0;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">שעה</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.startTime)}</td>
      </tr>
    </table>
    <div style="margin-top:16px;padding-top:16px;border-top:1px dashed ${SAGE_100};color:${SAGE_500};font-size:13px;line-height:1.6;">
      ניתן לבטל את ההזמנה עד ${p.cancellationHours} שעות לפני השיעור ולקבל קרדיט חזרה.
    </div>
  `;

  return {
    subject: `איזה כיף! מקומך בשיעור ${p.className} שוריין 🧘`,
    html: renderEmail({
      title: `מקומך שוריין ב-${p.className}`,
      intro: `היי ${escapeHtml(p.name)}, נתראה על המזרן!`,
      body,
      ctaLabel: "צפייה באזור האישי",
      ctaUrl: `${SITE_URL}/profile`,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Template C — Waitlist Promotion (marketing / opt-outable)
// ─────────────────────────────────────────────────────────────────────────────
export interface WaitlistPromotionParams {
  name: string;
  className: string;
  date: Date;
  startTime: string;
  /** Admin-editable override from SiteSettings.emailTemplatePromotion. */
  overrideTemplate?: string | null;
}

export function waitlistPromotionEmail(p: WaitlistPromotionParams) {
  const formattedDate = formatHebrewDate(p.date);
  const subject = `בשורה טובה! התפנה לך מקום בשיעור ${p.className} ✨`;

  // ── Admin template override (if provided) ──
  if (p.overrideTemplate && p.overrideTemplate.trim()) {
    const rendered = renderAdminTemplateEmail({
      template: p.overrideTemplate,
      data: {
        name: p.name,
        className: p.className,
        date: formattedDate,
        time: p.startTime,
      },
      title: `התפנה מקום ב-${p.className}`,
      ctaLabel: "צפייה בשיעורים שלי",
      ctaUrl: `${SITE_URL}/profile`,
    });
    if (rendered) return { subject, html: rendered.html };
  }

  // ── Built-in fallback (original hardcoded body) ──
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${SAGE_900};font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};width:80px;">השיעור</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.className)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">תאריך</td>
        <td style="padding:4px 0;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">שעה</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.startTime)}</td>
      </tr>
    </table>
    <div style="margin-top:14px;color:${SAGE_500};font-size:13px;line-height:1.6;">
      קרדיט אחד נוצל אוטומטית מחשבונך כחלק מהמעבר מרשימת ההמתנה.
    </div>
  `;

  return {
    subject,
    html: renderEmail({
      title: `התפנה מקום ב-${p.className}`,
      intro: `היי ${escapeHtml(p.name)}, התפנה מקום ועברת לרשימת המשתתפות. נתראה בקרוב!`,
      body,
      ctaLabel: "צפייה בשיעורים שלי",
      ctaUrl: `${SITE_URL}/profile`,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Template D — Class Reminder (marketing / opt-outable)
// ─────────────────────────────────────────────────────────────────────────────
export interface ReminderParams {
  name: string;
  className: string;
  date: Date;
  startTime: string;
  /** Admin-editable override from SiteSettings.emailTemplateReminder. */
  overrideTemplate?: string | null;
}

export function reminderEmail(p: ReminderParams) {
  const formattedDate = formatHebrewDate(p.date);
  const subject = `תזכורת: נפגשים היום לשיעור ${p.className} בשעה ${p.startTime}`;

  if (p.overrideTemplate && p.overrideTemplate.trim()) {
    const rendered = renderAdminTemplateEmail({
      template: p.overrideTemplate,
      data: {
        name: p.name,
        className: p.className,
        date: formattedDate,
        time: p.startTime,
      },
      title: "תזכורת לשיעור היום",
      ctaLabel: "צפייה בפרטי השיעור",
      ctaUrl: `${SITE_URL}/profile`,
    });
    if (rendered) return { subject, html: rendered.html };
  }

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${SAGE_900};font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};width:80px;">השיעור</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.className)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">תאריך</td>
        <td style="padding:4px 0;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">שעה</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.startTime)}</td>
      </tr>
    </table>
  `;

  return {
    subject,
    html: renderEmail({
      title: "תזכורת לשיעור היום",
      intro: `היי ${escapeHtml(p.name)}, רק מזכירים שהיום אנחנו נפגשים לתרגול. מחכים לך!`,
      body,
      ctaLabel: "צפייה בפרטי השיעור",
      ctaUrl: `${SITE_URL}/profile`,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Template E — Class Cancellation (transactional, ALWAYS sent)
//
//  Sent when an admin cancels a class instance or disables a whole
//  class definition. We treat this as transactional because:
//    (a) The student lost a booked seat — they need to know before
//        showing up at an empty studio.
//    (b) A credit has been refunded to their account — that's a
//        financial change they're legally entitled to be told about.
// ─────────────────────────────────────────────────────────────────────────────
export interface ClassCancellationParams {
  name: string;
  className: string;
  date: Date;
  startTime: string;
  creditRefunded: boolean;
  reason?: string;
  /** Admin-editable override from SiteSettings.emailTemplateCancellation. */
  overrideTemplate?: string | null;
}

export function classCancellationEmail(p: ClassCancellationParams) {
  const formattedDate = formatHebrewDate(p.date);
  const subject = `השיעור ${p.className} בתאריך ${formattedDate} בוטל`;

  if (p.overrideTemplate && p.overrideTemplate.trim()) {
    const rendered = renderAdminTemplateEmail({
      template: p.overrideTemplate,
      data: {
        name: p.name,
        className: p.className,
        date: formattedDate,
        time: p.startTime,
        reason: p.reason ?? "",
        creditRefunded: p.creditRefunded ? "כן" : "לא",
      },
      title: "השיעור בוטל",
      ctaLabel: "הרשמה לשיעור אחר",
      ctaUrl: `${SITE_URL}/schedule`,
    });
    if (rendered) return { subject, html: rendered.html };
  }

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${SAGE_900};font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};width:80px;">השיעור</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.className)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">תאריך</td>
        <td style="padding:4px 0;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">שעה</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.startTime)}</td>
      </tr>
    </table>
    ${
      p.reason
        ? `<div style="margin-top:14px;padding-top:14px;border-top:1px dashed ${SAGE_100};color:${SAGE_500};font-size:13px;line-height:1.6;">${escapeHtml(p.reason)}</div>`
        : ""
    }
    <div style="margin-top:14px;color:${SAGE_900};font-size:14px;line-height:1.6;">
      ${
        p.creditRefunded
          ? "<strong style=\"color:" + SAGE_600 + "\">הקרדיט שלך הוחזר אוטומטית לחשבון.</strong> את/ה מוזמנ/ת להירשם לשיעור אחר באותו השבוע."
          : "הקרדיט שלך נשאר זמין בחשבון להרשמה לשיעור אחר."
      }
    </div>
  `;

  return {
    subject,
    html: renderEmail({
      title: "השיעור בוטל",
      intro: `היי ${escapeHtml(p.name)}, נאלצנו לבטל את השיעור שהיית רשומ/ה אליו. מצטערות על אי-הנוחות.`,
      body,
      ctaLabel: "הרשמה לשיעור אחר",
      ctaUrl: `${SITE_URL}/schedule`,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Template F — Workshop Cancellation (transactional, ALWAYS sent)
//
//  Sent when an admin deletes/cancels a workshop that has paid
//  registrations. The payment is marked as refund-pending — Noa
//  will process the actual card refund through the PayMe dashboard.
// ─────────────────────────────────────────────────────────────────────────────
export interface WorkshopCancellationParams {
  name: string;
  workshopTitle: string;
  workshopDate: Date;
  amountIls: number;
}

export function workshopCancellationEmail(p: WorkshopCancellationParams) {
  const formattedDate = formatHebrewDate(p.workshopDate);
  const formattedAmount = `${p.amountIls.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${SAGE_900};font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};width:110px;">הסדנה</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.workshopTitle)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">תאריך</td>
        <td style="padding:4px 0;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">תשלום</td>
        <td style="padding:4px 0;font-weight:600;">${formattedAmount}</td>
      </tr>
    </table>
    <div style="margin-top:14px;color:${SAGE_900};font-size:14px;line-height:1.7;">
      <strong style="color:${SAGE_600};">ההחזר הכספי יעובד בימים הקרובים</strong> ויופיע באשראי שלך תוך
      1–7 ימי עסקים. אם לא ראית את ההחזר כעבור שבוע, כתבי לנו ונבדוק.
    </div>
  `;

  return {
    subject: `הסדנה ${p.workshopTitle} בוטלה — החזר כספי בדרך`,
    html: renderEmail({
      title: "הסדנה בוטלה",
      intro: `היי ${escapeHtml(p.name)}, נאלצנו לבטל את הסדנה שנרשמת אליה. אנחנו נדאג שתקבלי החזר כספי מלא.`,
      body,
      ctaLabel: "יצירת קשר",
      ctaUrl: `mailto:noayogaa@gmail.com`,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Template H — Workshop Reminder (marketing / opt-outable)
//
//  Sent by the daily cron to every paid registrant of an upcoming
//  workshop, `reminderTimingHours` hours before the start time.
//  Each workshop owns its own message body — Noa writes it when she
//  creates the workshop. If she leaves it empty we fall back to a
//  generic studio-branded message.
//
//  Marked marketing because, unlike a payment receipt, this is
//  promotional copy ("see you tomorrow!") that the user can opt out of
//  via their profile settings.
// ─────────────────────────────────────────────────────────────────────────────
export interface WorkshopReminderParams {
  name: string;
  workshopTitle: string;
  workshopDate: Date;
  /** Admin-authored message from Workshop.reminderEmailContent. Empty → fall back. */
  customBody?: string | null;
}

export function workshopReminderEmail(p: WorkshopReminderParams) {
  const formattedDate = formatHebrewDate(p.workshopDate);
  const startTime = `${String(p.workshopDate.getHours()).padStart(2, "0")}:${String(p.workshopDate.getMinutes()).padStart(2, "0")}`;
  const subject = `תזכורת לסדנה: ${p.workshopTitle}`;

  // 1. Admin-authored body wins. Variables resolved here.
  if (p.customBody && p.customBody.trim()) {
    const rendered = renderAdminTemplateEmail({
      template: p.customBody,
      data: {
        name: p.name,
        title: p.workshopTitle,
        date: formattedDate,
        time: startTime,
      },
      title: `תזכורת: ${p.workshopTitle}`,
      ctaLabel: "פרטי הסדנה",
      ctaUrl: `${SITE_URL}/workshops`,
    });
    if (rendered) return { subject, html: rendered.html };
  }

  // 2. Generic fallback if the admin didn't write a custom body.
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${SAGE_900};font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};width:80px;">הסדנה</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.workshopTitle)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">תאריך</td>
        <td style="padding:4px 0;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">שעה</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(startTime)}</td>
      </tr>
    </table>
  `;

  return {
    subject,
    html: renderEmail({
      title: "תזכורת לסדנה",
      intro: `היי ${escapeHtml(p.name)}, רק מזכירים שהסדנה ${escapeHtml(p.workshopTitle)} מתקרבת. נשמח לראות אותך!`,
      body,
      ctaLabel: "פרטי הסדנה",
      ctaUrl: `${SITE_URL}/workshops`,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Template I — Workshop Registration Confirmation (transactional, ALWAYS sent)
//
//  Sent the moment a workshop payment is captured. Combines the legal
//  receipt info (amount, transaction ref) with the registration details
//  (workshop title, date, time) so the user has everything in one
//  place. Replaces the previously-sent generic `paymentReceiptEmail`
//  for the workshop flow.
//
//  Transactional because: the payment was just captured (legal receipt
//  obligation) AND the seat was booked (logistical confirmation).
//  Cannot be opted out of.
// ─────────────────────────────────────────────────────────────────────────────
export interface WorkshopConfirmationParams {
  name: string;
  workshopTitle: string;
  workshopDate: Date;
  amountIls: number;
  transactionId: string;
  /** Optional — included verbatim so the user has a recap of what they paid for. */
  workshopDescription?: string | null;
}

export function workshopRegistrationConfirmationEmail(p: WorkshopConfirmationParams) {
  const formattedDate = formatHebrewDate(p.workshopDate);
  const startTime = `${String(p.workshopDate.getHours()).padStart(2, "0")}:${String(p.workshopDate.getMinutes()).padStart(2, "0")}`;
  const formattedAmount = `${p.amountIls.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;

  const body = `
    <div style="margin-bottom:8px;color:${SAGE_900};font-size:14px;font-weight:700;">פרטי הסדנה:</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${SAGE_900};font-size:14px;margin-bottom:14px;">
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};width:110px;">הסדנה</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(p.workshopTitle)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">תאריך</td>
        <td style="padding:4px 0;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">שעה</td>
        <td style="padding:4px 0;font-weight:600;">${escapeHtml(startTime)}</td>
      </tr>
    </table>

    <div style="margin-top:14px;padding-top:14px;border-top:1px dashed ${SAGE_100};margin-bottom:8px;color:${SAGE_900};font-size:14px;font-weight:700;">פרטי תשלום:</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${SAGE_900};font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};width:110px;">סכום</td>
        <td style="padding:4px 0;font-weight:600;">${formattedAmount}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${SAGE_500};">אישור עסקה</td>
        <td style="padding:4px 0;font-family:monospace;font-size:12px;color:${SAGE_500};">${escapeHtml(p.transactionId)}</td>
      </tr>
    </table>
  `;

  return {
    subject: `הרשמתך לסדנה ${p.workshopTitle} אושרה — Noa Yogis`,
    html: renderEmail({
      title: "ההרשמה אושרה!",
      intro: `היי ${escapeHtml(p.name)}, איזה כיף שנרשמת לסדנה. שמרנו לך מקום ונשמח לראות אותך.`,
      body,
      ctaLabel: "פרטי הסדנה",
      ctaUrl: `${SITE_URL}/workshops`,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatHebrewDate(d: Date): string {
  // Avoid pulling in date-fns here — keeps this module dependency-free
  // and email-safe (no client/server runtime assumptions).
  const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const months = [
    "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
    "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
  ];
  const dow = days[d.getDay()];
  const dom = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `יום ${dow}, ${dom} ב${month} ${year}`;
}
