# Noa Yogis

A **Sage & Silk** yoga studio management system — Hebrew-first, RTL, mobile-ready. Students browse the weekly schedule, purchase credits or punch-cards via PayMe, book classes, join waitlists, and register for workshops. The studio owner manages everything from a single admin dashboard.

Built with a strict "single source of truth" philosophy: every student-facing surface (schedule, pricing, cancel dialog, receipt email) reads from the same `SiteSettings` row so the admin's changes propagate everywhere in seconds.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack, RSC) |
| Language | **TypeScript** |
| Database | **Supabase PostgreSQL** (Frankfurt) via **Prisma 5** |
| Auth | **Clerk v7** (Hebrew localization, email + Google) |
| Payments | **PayMe** ([payme.io](https://payme.io)) — hosted payment page + server-to-server verification |
| Email | **Nodemailer** — 4 Hebrew RTL templates with opt-out toggle |
| UI | **Tailwind CSS 3.4** + Radix Dialog + custom sage palette |
| Charts | **Recharts** (admin analytics) |
| Hosting | **Vercel** (Edge middleware + Cron jobs) |

## Key Features

- **🧘 Weekly schedule** with real-time booking, auto-promote from waitlist, 6-hour-before cancel window (admin-configurable)
- **💳 Credits system** — single-class or 10-class punch cards, FIFO consumption, atomic transactions prevent double-booking
- **🎟️ Workshop registration** — separate ticketing with its own capacity + cancel rules
- **✉️ Automated emails** — Hebrew RTL templates for receipt, booking confirmation, waitlist promotion, 24h reminder. Transactional emails always send; marketing emails respect per-user opt-out (`receiveEmails` flag)
- **📊 Admin analytics** — demand heat-map, weekly revenue, utilization rate, top students with most-active hour
- **⚖️ Legal pages** — Terms, Privacy, Refund Policy (PayMe-compliance ready), dynamic cancellation window synced across all surfaces
- **🔒 RLS-locked DB** — Supabase anon/authenticated roles have zero privileges; only Prisma (postgres role) can read/write
- **🕐 Vercel Cron** — daily cleanup of stuck payments + daily class reminders

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
SUPABASE_SERVICE_ROLE_KEY=""   # enables Supabase Storage uploads for admin images; falls back to base64 if unset
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
| **Cancel a single occurrence** | `/admin/schedule` → click class → "ביטול" | Only this date; doesn't affect future recurring instances. |
| **Mark attendance** | `/admin/attendance` → pick date → check boxes | Saves the `attendedAt` timestamp on each booking. |
| **Add / remove credits manually** | `/admin/users` → +/- buttons or type exact number | Use this for cash payments or goodwill refunds. |
| **Publish a magazine article** | `/admin/articles` | Auto-generates slug, stores image in Supabase Storage (or base64 fallback). |
| **Create a workshop** | `/admin/workshops` | Separate ticketing; payments fund the workshop directly, not the credit system. |
| **Review stuck payments** | `/admin/payments` → "תשלומים תקועים" tab | Manual approve/reject for any payment that didn't auto-complete via webhook. |
| **View revenue + demand** | `/admin/analytics` | Weekly income, fill rate, top slots, most active students. |

### Global site settings

Go to **`/admin/settings`** to edit:

| Setting | Default | Effect |
|---|---|---|
| Hero title / subtitle | — | Homepage H1 + lede |
| Feature cards heading + 6 cards | — | Homepage "why practice with us" section |
| About section | — | Homepage bio + photo |
| **Credit price** | ₪50 | Single-class tier on `/pricing` |
| **Punch-card price** | ₪350 | 10-class tier on `/pricing` |
| **Cancellation window (hours)** | 6 | Refund-eligible window for class cancellations — reflected on schedule page, pricing bullets, cancel dialog, booking engine, receipt emails |

All settings save to a single `SiteSettings` row (`id = "main"`) and trigger a `revalidatePath` on affected routes, so changes are visible on the public site within seconds.

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
4. Deploy.

### Cron jobs (configured in `vercel.json`)

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/cleanup-pending-payments` | `0 3 * * *` (03:00 daily) | Marks PENDING payments/registrations older than 2 hours as FAILED |
| `/api/cron/reminders` | `0 9 * * *` (09:00 daily) | Emails students about classes 24h from now |

Hobby plan supports 2 cron jobs, daily frequency max. On Pro, change to hourly in `vercel.json`. Trigger manually:

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

## Privacy, Legal, and Email Opt-out

- **`/terms`** (תקנון ותנאי שימוש) — studio liability, health declaration, membership rules
- **`/privacy`** (מדיניות פרטיות) — GDPR/Israeli Privacy Law 1981 compliant disclosure
- **`/refund-policy`** (מדיניות ביטולים) — uses the admin-controlled cancellation window dynamically

Each user has a `receiveEmails` flag (default `true`) toggled from `/profile`. Marketing emails (booking confirmations, waitlist promotions, reminders) respect this flag. **Payment receipts always send** — required by Israeli consumer law regardless of the user's preference.

## Key File Reference

| Path | Purpose |
|---|---|
| `src/lib/site-settings.ts` | Single source of truth helper for `cancellationWindow` |
| `src/lib/booking-engine.ts` | All booking, cancel, and waitlist-promotion logic (serializable transactions) |
| `src/lib/payments.ts` | Payment completion helpers (idempotent, fires receipts) |
| `src/lib/payme-verify.ts` | Server-to-server IPN verification — prevents forged webhooks |
| `src/lib/email.ts` | 4 Hebrew RTL templates + transactional/marketing split |
| `src/lib/admin.ts` | Admin email whitelist |
| `src/actions/payme.ts` | Server actions that generate PayMe sale URLs |
| `src/app/api/webhooks/payme` | PayMe IPN webhook (dispatches by `custom_1` prefix) |
| `src/app/api/admin/analytics` | Single endpoint returning all dashboard data in parallel |
| `prisma/schema.prisma` | Full DB schema (15 models) |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Invalid `DATABASE_URL`" | Vercel env var wrapped in literal quotes | Re-enter without quotes in Vercel UI |
| "Internal Server Error" on `/schedule` | Stale `.next` cache after dependency install | `Remove-Item -Recurse -Force .next && npm run dev` |
| PayMe returns "Seller not found" | Seller ID belongs to production but API URL is sandbox (or vice versa) | Match `PAYME_SELLER_UID` to the `PAYME_API_URL` environment |
| "Failed to fetch" on dashboard | Admin role missing on user DB row | Sign out → sign in again; or manually set `role = 'ADMIN'` in Supabase Table Editor |
| No emails arriving | Gmail App Password not set, or SMTP_* env vars missing | Enable 2FA on the Gmail account → generate App Password → set `SMTP_PASS` on Vercel |
| Prisma "DLL locked" on Windows | Dev server still running | `Get-Process -Name node \| Stop-Process -Force` then retry |
| Webhook-verified payments sit PENDING | Stuck in PayMe retry queue | `/admin/payments` → click "אישור + הוספת קרדיטים" to approve manually |

## License

Private project — all rights reserved to Noa Ofir.
