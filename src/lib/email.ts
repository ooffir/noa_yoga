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
}

export function waitlistPromotionEmail(p: WaitlistPromotionParams) {
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
    <div style="margin-top:14px;color:${SAGE_500};font-size:13px;line-height:1.6;">
      קרדיט אחד נוצל אוטומטית מחשבונך כחלק מהמעבר מרשימת ההמתנה.
    </div>
  `;

  return {
    subject: `בשורה טובה! התפנה לך מקום בשיעור ${p.className} ✨`,
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
}

export function reminderEmail(p: ReminderParams) {
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
  `;

  return {
    subject: `תזכורת: נפגשים היום לשיעור ${p.className} בשעה ${p.startTime}`,
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
