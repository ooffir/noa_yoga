# Noa Yogis

A **Sage & Silk** yoga studio management system — Hebrew-first, RTL, mobile-ready. Students browse the weekly schedule, purchase credits or punch-cards via PayMe, book classes, join waitlists, and register for workshops. The studio owner manages everything from a single admin dashboard.

Built with a strict "single source of truth" philosophy: every student-facing surface (schedule, pricing, cancel dialog, receipt email, footer) reads from the same `SiteSettings` row so the admin's changes propagate everywhere within seconds — no redeploy required.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack, RSC) |
| Language | **TypeScript** |
| Database | **Supabase PostgreSQL** (Frankfurt) via **Prisma 5** |
| Auth | **Clerk v7** (Hebrew localization, email + Google) |
| Payments | **PayMe** ([payme.io](https://payme.io)) — hosted payment page + server-to-server verification + refund-event webhook |
| Email | **Nodemailer** — 6 Hebrew RTL templates, 3 of them admin-editable with `{{variable}}` interpolation |
| Markdown | **react-markdown** + **remark-breaks** — articles, workshop descriptions, admin email templates |
| UI | **Tailwind CSS 3.4** + Radix Dialog + custom sage palette |
| Charts | **Recharts** (admin analytics) |
| Hosting | **Vercel** (Edge middleware + hourly Cron jobs) |

## Key Features

- **🧘 Weekly schedule** with real-time booking, auto-promote from waitlist, admin-configurable cancellation window, waitlist position indicator ("מקום 3 בתור")
- **💳 Three-tier credits system** — single-class, 5-session punch card, 10-session punch card (all prices admin-editable). FIFO consumption, Serializable transactions prevent double-booking and over-promotion
- **🎟️ Workshop registration** — separate ticketing, Markdown descriptions, mandatory cancellation-policy consent (Israeli Consumer Protection Law compliance), archive view for past workshops
- **✉️ Automated emails** — Hebrew RTL templates for receipt, booking confirmation, waitlist promotion, class reminder, class cancellation, workshop cancellation. Transactional emails always send; marketing emails respect the per-user `receiveEmails` opt-out flag. Three templates (reminder / promotion / cancellation) are **admin-editable** with `{{name}}`, `{{className}}`, `{{date}}`, `{{time}}` variable substitution
- **🕐 Smart reminder scheduling** — cron runs hourly but only dispatches at the admin-configured `reminderHour` (Asia/Jerusalem, DST-aware), `reminderDaysBefore` days out from the class
- **♻️ Cancellation cascade** — when an admin cancels a class or deletes a workshop, all affected bookings are atomically cancelled, credits refunded (direct or punch card source), waitlists cleared, and students notified via transactional email — all inside one Serializable transaction
- **📊 Admin analytics** — demand heat-map, weekly revenue (COMPLETED only), utilization rate, top students with most-active hour, active-vs-inactive student split
- **👤 Per-student drill-down** — click any student's name in the admin users list to see their upcoming + past bookings + active punch cards + attendance stats, all in one dialog
- **🛡️ Payment resilience** — webhook returns HTTP 500 on DB failure so PayMe retries; server-side dedup window prevents duplicate Payment rows from rapid double-clicks; self-heal on `/payments/success` if webhook is delayed
- **💸 Refund handling** — when Noa refunds via the PayMe dashboard, the `payme_sale_status: "refunded"` webhook freezes the corresponding PunchCard and marks the Payment REFUNDED
- **⚖️ Legal pages** — Terms, Privacy, Refund Policy, all synced with the admin-controlled cancellation window
- **🔒 RLS-locked DB** — Supabase anon/authenticated roles have zero privileges; only Prisma (postgres role) can read/write
- **📞 Dynamic footer** — contact email / phone / Instagram / WhatsApp URLs editable from `/admin/settings`

## Environment Variables

Copy `.env.example` to `.env` for local development. On Vercel, set these under **Project Settings → Environment Variables**. Every variable here is required unless marked optional.

```bash
# ─── Database (Supabase) ───
DATABASE_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:6543/postgres?pgbouncer=true&connection_limit=5&pool_timeout=30"
DIRECT_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres"

# ─── Clerk (auth) ───
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."
CLERK_SECRET_KEY="sk_live_..."
CLERK_WEBHOOK_SECRET="whsec_..."

# ─── Site ───
NEXT_PUBLIC_SITE_URL="https://noa-yoga.vercel.app"   # no trailing slash

# ─── PayMe (payments) ───
PAYME_SELLER_UID="MPL12345-..."
PAYME_API_URL="https://live.payme.io/api/generate-sale"
# For testing: https://sandbox.payme.io/api/generate-sale

# ─── Email (SMTP) ───
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="studio-email@gmail.com"
SMTP_PASS="<gmail-app-password>"
EMAIL_FROM="Noa Yogis <studio-email@gmail.com>"

# ─── Cron (Vercel) ───
CRON_SECRET="<any long random string>"

# ─── Optional ───
SUPABASE_SERVICE_ROLE_KEY=""          # enables Supabase Storage uploads for admin images; falls back to base64 if unset
CANCELLATION_HOURS_BEFORE=""          # legacy fallback for cancellation window; DB value wins when present
```

### Vars that are referenced in code

| Where | Variable | Purpose |
|---|---|---|
| `src/lib/prisma.ts` | `DATABASE_URL` | Runtime pool, every Prisma query |
| `src/app/api/webhooks/clerk` | `CLERK_WEBHOOK_SECRET` | Svix signature verification on user sync |
| `src/actions/payme.ts` + `src/lib/payme-verify.ts` | `PAYME_SELLER_UID`, `PAYME_API_URL`, `NEXT_PUBLIC_SITE_URL` | Sale creation + IPN verification |
| `src/lib/email.ts` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Nodemailer transport |
| `src/app/api/cron/*` | `CRON_SECRET` | Bearer token that gates all three cron routes |
| `src/app/api/admin/upload` | `SUPABASE_SERVICE_ROLE_KEY` | Optional — enables Supabase Storage upload path |

## Admin Access

Admin privileges are granted automatically by email. The whitelist lives in `src/lib/admin.ts`:

```ts
export const ADMIN_EMAILS = [
  "noayogaa@gmail.com",    // primary — studio owner
  "omer609994@gmail.com",  // secondary — support + maintenance
] as const;
```

> **Important:** this whitelist only controls **who is promoted to ADMIN on first signup**. It does not retroactively change existing DB rows. To change an existing user's role, run an `UPDATE` on the `users` table in Supabase:
>
> ```sql
> UPDATE public.users SET role = 'STUDENT' WHERE email = 'old-admin@example.com';
> ```

When a user signs up through Clerk, `getSharedUser()` in `src/lib/auth-helpers.ts` checks their email against this list and sets `role: "ADMIN"` on the new DB row — no manual DB edit required. To add a new admin later: edit the array and redeploy.

## Admin Setup Guide (for Noa)

The admin dashboard lives at **`/admin`** and requires an admin-whitelisted email to access.

### Daily / weekly tasks

| Task | Where | Notes |
|---|---|---|
| **Add a new class** | `/admin/schedule` → "שיעור חדש" | Choose recurring or one-off. Recurring classes auto-generate instances 12 weeks ahead. |
| **Cancel a single occurrence** | `/admin/schedule` → click class → "ביטול" | All booked students are refunded automatically + notified via email. Waitlist for that instance is cleared. |
| **Cancel an entire recurring class** | `/admin/schedule` → click class → "מחיקה" | Cascades the same refund + email flow across all future instances. |
| **Mark attendance** | `/admin/attendance` → pick date → check boxes | Saves the `attendedAt` timestamp on each booking. Also shows the waitlist for the selected class. |
| **Promote a waitlist student manually** | `/admin/attendance` → pick class → "הכנס לשיעור" beside the student | Bypasses capacity (allows 11/10), deducts 1 credit from the student, creates CONFIRMED booking, sends promotion email. Fails safely if the student has no credits. |
| **Remove a student from a class** | via the students API (used by admin scripts); also surfaces on class detail views | Refunds the credit to original source (punch card or direct) by default. Pass `refundCredit: false` to forfeit the credit (no-show policy). |
| **Add / remove credits manually** | `/admin/users` → +/- buttons or type exact number | Use this for cash payments or goodwill refunds. |
| **View student booking history** | `/admin/users` → click student's name | Opens dialog with upcoming bookings, past history (last 50), punch cards with remaining credits, attendance + cancel counts. |
| **Publish a magazine article** | `/admin/articles` | Markdown supported: `**bold**`, `## headings`, `- lists`, `![images](url)`. Single Enter → line break; double Enter → new paragraph. |
| **Create / edit / archive workshops** | `/admin/workshops` | Tabs "קרובות" / "ארכיון" partition by date. Markdown in the description renders on the public `/workshops` page. Archived workshops are read-only (can't accidentally email refund notices). |
| **Review stuck payments** | `/admin/payments` → "תשלומים תקועים" tab | Manual approve/reject for any payment that didn't auto-complete via webhook. Receipts fire automatically on approval. |
| **View revenue + demand** | `/admin/analytics` | Weekly income, fill rate, top slots, most active students. Filters out FAILED/CANCELLED/REFUNDED payments. |
| **Dashboard snapshot** | `/admin` | Total students, active vs inactive split (credits > 0 or punch card active), monthly revenue, weekly bookings, popular classes. |

### Global site settings

Go to **`/admin/settings`** to edit:

#### Content

| Setting | Default | Effect |
|---|---|---|
| Hero title / subtitle | — | Homepage H1 + lede |
| Feature cards heading + 6 cards | — | Homepage "why practice with us" section |
| About section | — | Homepage bio + photo |

#### Pricing

| Setting | Default | Effect |
|---|---|---|
| **Credit price** (`creditPrice`) | ₪50 | Single-class tier on `/pricing` and `/schedule` checkout popup |
| **5-session punch card** (`punchCard5Price`) | ₪200 | Middle tier on `/pricing` + checkout popup |
| **10-session punch card** (`punchCardPrice`) | ₪350 | Top tier on `/pricing` + checkout popup |
| **Cancellation window (hours)** (`cancellationWindow`) | 6 | Refund-eligible window for class cancellations — reflected on schedule page, pricing bullets, cancel dialog, booking engine, receipt emails |

#### Email dispatch

| Setting | Default | Effect |
|---|---|---|
| **Reminder hour** (`reminderHour`, 0-23) | 9 | Hour-of-day (Asia/Jerusalem, DST-aware) when daily reminders go out. Cron runs hourly and no-ops on other hours. |
| **Days before class** (`reminderDaysBefore`, 0-14) | 1 | Reminder reaches the student this many days before the class. `0` = same-day reminder. |
| **Reminder template** (`emailTemplateReminder`) | empty → fallback | Admin-editable body for the daily reminder email. Supports `{{name}}`, `{{className}}`, `{{date}}`, `{{time}}`. |
| **Waitlist promotion template** (`emailTemplatePromotion`) | empty → fallback | Admin-editable body for waitlist promotion emails. |
| **Class cancellation template** (`emailTemplateCancellation`) | empty → fallback | Admin-editable body for class cancellation emails. Extra vars: `{{reason}}`, `{{creditRefunded}}`. |

Leave any template blank to keep the built-in Hebrew fallback. Templates support basic formatting: blank line = new paragraph, `**text**` = bold, single line break preserved.

#### Footer contact

| Setting | Default | Effect |
|---|---|---|
| **Contact email** (`contactEmail`) | `noayogaa@gmail.com` | Mailto link + email icon in the footer + "contact us" address in email footers |
| **Phone** (`contactPhone`) | empty | Hidden from footer when blank; otherwise renders a clickable `tel:` link |
| **Instagram URL** (`instagramUrl`) | Noa's account | Social icon in footer; hidden if blank |
| **WhatsApp group URL** (`whatsappUrl`) | Noa's group | Social icon in footer; hidden if blank |

All settings save to a single `SiteSettings` row (`id = "main"`) and trigger a `revalidatePath` on affected routes. The footer is a Server Component that reads fresh values on every request.

## Local Development

```bash
# 1. Clone + install
git clone <repo-url>
cd yoga
npm install

# 2. Copy env template and fill in values
cp .env.example .env
# Edit .env — fill DATABASE_URL, Clerk keys, PayMe keys (sandbox), SMTP (optional for dev)

# 3. Push the schema to your Supabase DB
npx prisma db push

# 4. Start dev server
npm run dev
```

Visit `http://localhost:3000`. Sign up with an admin email (see `src/lib/admin.ts`) to get the admin dashboard.

### Useful commands

```bash
npm run dev          # Turbopack dev server (fast HMR)
npm run build        # Production build (runs prisma generate first)
npm run lint         # ESLint
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma db push   # Sync schema → Supabase (additive, safe)
npx prisma studio    # GUI browser for the DB
```

### Windows tip

Prisma holds a lock on `query_engine-windows.dll` while the dev server is running. Before `npx prisma generate` or `db push`:

```powershell
Get-Process -Name node | Stop-Process -Force
```

Then run the Prisma command, then `npm run dev` again.

## Deployment (Vercel)

1. Push the repo to GitHub / GitLab.
2. Connect on Vercel → framework detected as Next.js.
3. Set **all environment variables** from the list above (Production + Preview).
4. **Before the first deploy with these features**, run the SQL migrations (see below).
5. Deploy.

### Required one-time DB migrations

Open the **Supabase SQL editor** and run each file in `prisma/migrations/` — in file order, from oldest to newest. All migrations use `ADD COLUMN IF NOT EXISTS`, so they're idempotent and safe to re-run:

```sql
-- 1. prisma/migrations/add_email_settings.sql
--    Adds reminderHour, reminderDaysBefore, and 3 admin-editable email templates.

-- 2. prisma/migrations/add_footer_contact_fields.sql
--    Adds contactEmail, contactPhone, instagramUrl, whatsappUrl.
```

All new DB reads in the code are defensive: if a column doesn't exist yet, the fallback path takes over and the site keeps rendering. Running the SQL above unlocks the admin UI for editing those new fields.

### Cron jobs (configured in `vercel.json`)

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/cleanup-pending-payments` | `0 3 * * *` (03:00 daily) | Marks PENDING payments/registrations older than 2 hours as FAILED |
| `/api/cron/reminders` | `0 * * * *` (hourly) | Checks `reminderHour` in settings; only dispatches reminders when current Jerusalem hour matches |

Why hourly instead of a fixed schedule? So Noa can change the reminder time from `/admin/settings` without a redeploy. The cron fires every hour; the handler returns `{skipped: true}` unless the hour matches — a 23/24 no-op rate is a small price for a configurable UX.

Trigger a cron manually (e.g., for testing):

```bash
curl https://<domain>/api/cron/cleanup-pending-payments \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### Schema changes (Prisma)

When editing `prisma/schema.prisma`:

```bash
# 1. Locally — regenerate client + push to Supabase (additive, non-destructive)
npx prisma generate
npx prisma db push

# 2. Commit + push to Git
git push

# 3. Vercel rebuilds. The `postinstall` hook auto-runs prisma generate,
#    so the client stays in sync with what's in your committed schema.
```

For destructive changes (dropping columns, renaming), take a backup first:

```bash
npx tsx scripts/backup-db.ts   # writes full_site_backup.json
```

For production deploys where Supabase is shared with other environments, author an idempotent SQL migration in `prisma/migrations/` and run it manually — that's how we handled `add_email_settings.sql` and `add_footer_contact_fields.sql`.

## Booking, Waitlist, and Cancellation Behaviors

### Credits are required to join a waitlist

A 0-credit student clicking either **הרשמה** or **רשימת המתנה** triggers the same purchase dialog on `/schedule`. The server-side check in `BookingEngine.bookClass` throws *"אין לך יתרת שיעורים"* before any waitlist row is created, so we never end up with a waitlisted user who can't actually claim their promotion.

The credit is **not deducted** when joining the waitlist — only when promotion happens (either automatically on a cancellation or manually by admin).

### Waitlist position

Every waitlist-pill in the student schedule shows `"מקום N בתור"`. Position is computed from `createdAt` ordering (not the `position` integer column, which has gaps after `leaveWaitlist()` / `EXPIRED` skips). Students can also leave a waitlist via the same pill.

### Auto-promotion (immediate, transactional)

Any event that opens a seat promotes the next waiter in the **same** Serializable transaction that caused the opening:

- Student cancels → `BookingEngine.cancelBooking` → `promoteFromWaitlist` inside the tx.
- Admin removes a student → `BookingEngine.adminRemoveStudent` → same.
- Admin raises class capacity → `BookingEngine.adminSetCapacity` → loops `promoteFromWaitlist` up to `newCapacity − confirmedCount`.

Promotion emails dispatch **after** the tx commits using the admin-editable `emailTemplatePromotion` template. Failure to send doesn't roll back the promotion.

### Cancellation cascade

When an admin cancels a single instance (`adminCancelClassInstance`) or deletes a recurring definition (`DELETE /api/admin/schedule/[id]`, loops through each future instance), the flow is:

1. Mark instance `isCancelled: true`.
2. Loop every `CONFIRMED` booking — flip to `CANCELLED`, `creditRefunded: true`, refund to original source (punch card or direct credits).
3. Clear all `WAITING` waitlist entries for that instance.
4. Reset `currentBookings` to 0.

Steps 1-4 run inside **one** Serializable transaction. If any step fails, none commit. After the commit, transactional (opt-out-bypassing) cancellation emails dispatch using the admin-editable `emailTemplateCancellation` template.

### Workshop cancellation

Identical pattern for workshops: `DELETE /api/admin/workshops/[id]` flips the workshop inactive, marks every non-CANCELLED registration `CANCELLED`, and emails previously-PAID registrants a `workshopCancellationEmail` telling them their refund is being processed. The actual card-side refund happens in the PayMe dashboard (out of our control — PayMe doesn't expose a refund API for our tier).

## Payments, Webhooks, and Refunds

### Sale generation

`src/actions/payme.ts` generates a hosted-payment-page URL for either a credit/punch-card purchase (`generatePaymeSaleForCredits`) or a workshop registration (`generatePaymeSaleForWorkshop`). Dedup guard: rapid double-clicks in the last 60 seconds reuse the same PENDING Payment row instead of creating duplicates.

### Webhook (`/api/webhooks/payme`)

The webhook dispatches on `custom_1` prefix (`pay:` vs `wsr:`) and handles three states:

1. **Success** — re-verified via PayMe's `/get-sales` server-to-server endpoint before granting credits. A forged IPN with no matching PayMe record is rejected with 401.
2. **Failure / cancelled** — flips the Payment to FAILED (no verification needed — forging a failure just loses the user a registration).
3. **Refund** — when `payme_sale_status: "refunded"` arrives, `refundPayment()` marks the Payment REFUNDED and zeroes the associated PunchCard so the student can't book further classes with revoked credits.

Any DB error inside the dispatcher returns **HTTP 500** so PayMe retries later. All dispatchers (`completePaymentSuccess`, `completeWorkshopSuccess`, `refundPayment`) are idempotent → retries are always safe.

### Self-heal on return URL

`/payments/success` and `/workshops` pages also re-verify PayMe state independently, so even if the webhook is delayed by minutes, a user who returns via the return URL still sees their credits promptly (and the system self-completes the payment).

## Privacy, Legal, and Email Opt-out

- **`/terms`** (תקנון ותנאי שימוש) — studio liability, health declaration, membership rules
- **`/privacy`** (מדיניות פרטיות) — GDPR/Israeli Privacy Law 1981 compliant disclosure
- **`/refund-policy`** (מדיניות ביטולים) — uses the admin-controlled cancellation window dynamically

### Email transactional vs marketing split

| Email | Category | Respects `receiveEmails` opt-out? |
|---|---|---|
| Payment receipt (class credit) | Transactional | ❌ always sends |
| Payment receipt (workshop) | Transactional | ❌ always sends |
| Class cancellation | Transactional | ❌ always sends (financial change + they had a seat) |
| Workshop cancellation | Transactional | ❌ always sends (refund-pending notice) |
| Booking confirmation | Marketing | ✅ opt-out respected |
| Waitlist promotion | Marketing | ✅ opt-out respected |
| Daily class reminder | Marketing | ✅ opt-out respected |

Each user has a `receiveEmails` flag (default `true`) toggled from `/profile`. **Payment receipts and cancellation notices always send** — required by Israeli consumer law regardless of the user's marketing preference.

### Workshop cancellation consent

Before the PayMe redirect on `/workshops`, the user must tick a checkbox confirming they've read the cancellation ladder (14d / 7d / <7d refund rules). The "אישור והמשך לתשלום" button stays disabled until consented — satisfies Consumer Protection Law §14ג for remote transactions.

## Key File Reference

| Path | Purpose |
|---|---|
| `src/lib/site-settings.ts` | Single source of truth helper for `cancellationWindow` + `getEmailDispatchConfig` |
| `src/lib/booking-engine.ts` | All booking / cancel / waitlist-promotion logic (Serializable transactions). Includes `adminCancelClassInstance`, `adminSetCapacity`, `adminPromoteWaitlistStudent`, `leaveWaitlist` |
| `src/lib/payments.ts` | Payment completion + refund helpers (idempotent, fires receipts) |
| `src/lib/payme-verify.ts` | Server-to-server IPN verification — prevents forged webhooks |
| `src/lib/email.ts` | 6 Hebrew RTL templates + transactional/marketing split + `formatEmail({{var}})` + `renderAdminTemplateEmail` |
| `src/lib/product-catalog.ts` | Single source of truth for `SINGLE_CLASS` / `PUNCH_CARD_5` / `PUNCH_CARD` credit counts and labels |
| `src/lib/admin.ts` | Admin email whitelist |
| `src/actions/payme.ts` | Server actions that generate PayMe sale URLs (with 60s dedup) |
| `src/app/api/webhooks/payme` | PayMe IPN webhook — dispatches by `custom_1` prefix, returns 500 on DB failure for retries, handles refunds |
| `src/app/api/waitlist/leave` | Student-initiated waitlist exit |
| `src/app/api/admin/attendance/[instanceId]` | GET returns `{bookings, waitlist}`; POST handles both attendance-toggle and `action: "promote"` |
| `src/app/api/admin/users/[id]/history` | Per-student full booking + punch-card history for admin drill-down |
| `src/app/api/admin/analytics` | Single endpoint returning all dashboard data in parallel |
| `src/app/api/cron/reminders` | Hourly cron — skips unless current Jerusalem hour matches `reminderHour` |
| `src/components/layout/footer.tsx` | Async Server Component; reads contact info from `SiteSettings` |
| `src/components/schedule/book-button.tsx` | Book / cancel / waitlist / leave-waitlist actions |
| `src/components/schedule/book-choice-dialog.tsx` | Three-tier purchase popup for 0-credit students |
| `src/components/workshops/register-button.tsx` | Two-step flow with cancellation-consent gate |
| `prisma/schema.prisma` | Full DB schema (15 models, 7 enums) |
| `prisma/migrations/*.sql` | Idempotent `ADD COLUMN IF NOT EXISTS` migrations; run on Supabase before deploy |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Invalid `DATABASE_URL`" | Vercel env var wrapped in literal quotes | Re-enter without quotes in Vercel UI |
| "Internal Server Error" on `/schedule` | Stale `.next` cache after dependency install | `Remove-Item -Recurse -Force .next && npm run dev` |
| PayMe returns "Seller not found" | Seller ID belongs to production but API URL is sandbox (or vice versa) | Match `PAYME_SELLER_UID` to the `PAYME_API_URL` environment |
| "Failed to fetch" on dashboard | Admin role missing on user DB row | Sign out → sign in again; or manually set `role = 'ADMIN'` in Supabase Table Editor |
| No emails arriving | Gmail App Password not set, or SMTP_* env vars missing | Enable 2FA on the Gmail account → generate App Password → set `SMTP_PASS` on Vercel |
| Reminder cron runs but sends nothing | Current Jerusalem hour ≠ `reminderHour` | Check `/admin/settings → reminderHour`; response body will show `{skipped: true, reason: "..."}` |
| Email templates show `{{name}}` literally | Unknown variable in template | Check spelling; `formatEmail` leaves unknown `{{keys}}` intact so the typo is visible |
| Admin can't save new fields (contact/templates) | Migration SQL hasn't been run yet | Run the relevant file in `prisma/migrations/` on Supabase → redeploy |
| Footer shows old values after settings save | Page was hot-cached at the CDN | Settings save calls `revalidatePath("/")`; wait a few seconds or hard-refresh |
| Prisma "DLL locked" on Windows | Dev server still running | `Get-Process -Name node \| Stop-Process -Force` then retry |
| Webhook-verified payments sit PENDING | Stuck in PayMe retry queue | `/admin/payments` → click "אישור + הוספת קרדיטים" to approve manually |
| Workshop cancel sent wrong-looking emails | You deleted a workshop from the **Archive** tab | Archive tab hides the delete button for this exact reason — double-check you're on "קרובות" |
| Waitlist position shows wrong number | Some `WaitlistEntry` rows might be duplicated with status mismatches | Position calculation uses `status=WAITING` only; cancelled/expired entries are automatically excluded |

## License

Private project — all rights reserved to Noa Ofir.
