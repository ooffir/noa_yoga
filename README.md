# Noa Yogis

A Hebrew-first, RTL yoga studio platform built with Next.js 16, Clerk, Prisma, and Supabase. Features class scheduling, bookings with credits, workshops, an internal blog/magazine, and a fully dynamic admin-managed homepage.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.2.1 (App Router, Turbopack) + TypeScript |
| Auth | Clerk v7 (Hebrew localization via `heIL`) |
| Database | Supabase PostgreSQL + Prisma 5.22 |
| Styling | Tailwind CSS 3.4 |
| UI Components | Radix UI (Dialog, Slot) |
| Icons | lucide-react (named imports only) |
| Validation | Zod |
| Payments | PayPlus (Israeli payment provider) |
| Email | Nodemailer (implemented but using placeholder SMTP credentials) |
| Webhooks | Svix (Clerk webhook verification) |

## All Routes (41 total)

### Public (no auth required)

| Route | Description |
|-------|-------------|
| `/` | Landing page (dynamic hero, feature cards, about me, social links) |
| `/sign-in` | Clerk sign-in (catch-all) |
| `/sign-up` | Clerk sign-up (catch-all) |
| `/articles` | Magazine / blog listing |
| `/articles/[slug]` | Individual article reader |
| `/workshops` | Workshops listing with registration |

### Student (requires sign-in)

| Route | Description |
|-------|-------------|
| `/schedule` | Weekly class schedule with booking |
| `/profile` | Personal area — credits, booking history |
| `/pricing` | Purchase credits or punch cards (dynamic prices from admin) |
| `/payments/success` | Post-payment confirmation |

### Admin (requires admin role)

| Route | Description |
|-------|-------------|
| `/admin` | Dashboard — stats, revenue, popular classes |
| `/admin/schedule` | Create/edit/cancel classes (recurring + one-time) |
| `/admin/users` | Manage students and credits |
| `/admin/attendance` | Mark attendance per class |
| `/admin/workshops` | Create/edit workshops |
| `/admin/articles` | Create/edit blog articles with image upload |
| `/admin/settings` | Edit homepage content, pricing, about me |

### API Routes (24 endpoints)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/bookings` | Book a class (credits or punch card) |
| `POST /api/bookings/[id]/cancel` | Cancel booking with refund logic |
| — | Workshop registration is handled by the `generatePaymeSaleForWorkshop` server action (`src/actions/payme.ts`); the old `POST /api/workshops/register` route has been removed |
| `GET /api/schedule` | Public schedule data |
| `GET /api/user/credits` | User credit balance |
| `GET/POST /api/admin/schedule` | Admin class CRUD |
| `GET/PUT/DELETE /api/admin/schedule/[id]` | Edit/deactivate class definition |
| `PATCH /api/admin/instances/[id]` | Cancel individual class instance |
| `GET/PATCH /api/admin/users` | List students / update credits |
| `GET/POST /api/admin/articles` | Article CRUD |
| `PUT/DELETE /api/admin/articles/[id]` | Edit/delete article |
| `GET/POST /api/admin/workshops` | Workshop CRUD |
| `PUT/DELETE /api/admin/workshops/[id]` | Edit/deactivate workshop |
| `GET/PUT /api/admin/settings` | Site settings (hero, about, pricing) |
| `GET/PUT /api/admin/feature-cards` | Homepage feature cards |
| `POST /api/admin/upload` | Image upload (Supabase Storage or base64) |
| `GET /api/admin/dashboard` | Dashboard statistics |
| `POST /api/admin/students/[id]` | Admin add/remove student from class |
| `GET/POST /api/admin/attendance/[instanceId]` | Attendance data + marking |
| `POST /api/webhooks/clerk` | Clerk user sync webhook |
| `POST /api/payments/checkout` | PayPlus payment page creation (credits / punch cards) |
| `POST /api/payments/webhook` | PayPlus payment webhook (credits / punch cards) |
| `POST /api/webhooks/payme` | PayMe IPN webhook — marks workshop registrations COMPLETED |
| `GET /api/cron/generate-instances` | Auto-generate class instances |
| `GET /api/cron/reminders` | Send reminder emails |

## Database Models (13 total)

| Model | Purpose |
|-------|---------|
| User | Students + admins (synced from Clerk via `clerkId`) |
| ClassDefinition | Recurring/one-time class templates |
| ClassInstance | Specific class on a specific date |
| Booking | Student → ClassInstance registration |
| WaitlistEntry | Waitlist with auto-promotion |
| PunchCard | 10-class credit cards |
| Payment | Stripe payment records |
| Article | Internal blog posts with slug routing |
| Workshop | Standalone paid events |
| WorkshopRegistration | Workshop signups (separate from class credits) |
| SiteSettings | Homepage content, pricing config |
| FeatureCard | Dynamic homepage value cards |
| Account/Session/VerificationToken | Legacy NextAuth tables (kept for schema compat) |

## Admin Access

Admin users are defined in `src/lib/admin.ts`:
- `omer609994@gmail.com`
- `noa6660011@gmail.com`

New admin emails can be added to the `ADMIN_EMAILS` array. Users are auto-promoted to admin on first sign-in.

## Booking Logic

1. Check `user.credits` (admin-assigned direct credits)
2. If 0, check active punch cards (FIFO — oldest first)
3. If class is full, add to waitlist (auto-promoted when spot opens)
4. If no credits at all, show "לתשלום והרשמה" link to `/pricing`
5. Workshops bypass the credit system entirely — separate registration flow

Cancellation refunds credit if cancelled 6+ hours before class (configurable via `CANCELLATION_HOURS_BEFORE`).

## Dynamic Admin Settings

The admin can configure from `/admin/settings`:
- Hero title and subtitle
- Feature cards heading and subtitle
- Feature cards (up to 6, with icon selection)
- About Me section (title, subtitle, bio text, profile image)
- **Pricing**: single credit price and punch card price (reflected on `/pricing`)

## Performance Optimizations

### Caching

| Page | Strategy |
|------|----------|
| Homepage `/` | ISR `revalidate = 3600` |
| Schedule `/schedule` | ISR `revalidate = 60` + `unstable_cache` with tag `schedule` |
| Articles `/articles` | ISR `revalidate = 60` |
| Workshops `/workshops` | ISR `revalidate = 60` |
| Pricing `/pricing` | ISR `revalidate = 60` |
| Admin pages | `force-dynamic` with `<Suspense>` skeletons |

### Auth

- `auth()` — instant JWT decode (no network call)
- User lookup by indexed `clerkId` column
- `currentUser()` only called once on first sign-in
- `React.cache()` deduplicates within a request
- Navbar gets user data as props — zero independent DB calls

### Bundle

- Named imports only for lucide-react (no `import *`)
- Unused Radix packages removed (7 packages)
- `next.config.js`: `compress: true`, `poweredByHeader: false`
- Static asset cache: `max-age=31536000, immutable`
- Image cache: `minimumCacheTTL: 3600`

### Database

- Prisma singleton pattern
- PgBouncer connection pooling (`connection_limit=5, pool_timeout=30`)
- Indexes on `clerkId`, `email`, `date`, `status`, `role`, `slug`

## PayPlus & Email Status

**PayPlus**: The payment integration uses PayPlus (Israeli provider). It creates a payment page link, redirects the user, and processes the webhook callback to grant credits. To activate:
1. Create a PayPlus account at https://www.payplus.co.il
2. Set `PAYPLUS_API_KEY`, `PAYPLUS_SECRET_KEY`, and `PAYPLUS_PAGE_UID` in `.env`
3. Set the webhook URL in PayPlus dashboard to: `https://yourdomain.com/api/payments/webhook`
4. Prices are configured dynamically from Admin Settings (`/admin/settings`)

**Nodemailer**: Email sending is implemented (booking confirmations, waitlist promotions, reminders). The SMTP credentials are placeholders. To activate:
1. Set real SMTP credentials in `.env`
2. Update `EMAIL_FROM` to the studio's email address

## Environment Variables

```env
# Database (Supabase)
DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=5&pool_timeout=30
DIRECT_URL=postgresql://...

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# PayPlus
PAYPLUS_API_KEY=
PAYPLUS_SECRET_KEY=
PAYPLUS_PAGE_UID=

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# Optional: Supabase Storage
SUPABASE_SERVICE_ROLE_KEY=

# Config
CANCELLATION_HOURS_BEFORE=6
PUNCH_CARD_CREDITS=10

# Cron (for /api/cron/* endpoints)
CRON_SECRET=
```

## File Reference

Every file in the project, grouped by area. **Context** = where it lives / what layer it belongs to. **Target** = what it does / who consumes it.

### Root configuration

| File | Context | Target |
|------|---------|--------|
| `next.config.js` | Build config | Next.js config — image remote domains (Supabase Storage), compression, cache headers, disables `x-powered-by` |
| `tsconfig.json` | Build config | TypeScript compiler options and path aliases (`@/*` → `src/*`) |
| `package.json` | Build config | Dependencies, versions, `npm` scripts (`dev`, `build`, `db:push`, `db:seed`, `db:studio`) |
| `postcss.config.js` | Build config | PostCSS pipeline for Tailwind + autoprefixer |
| `tailwind.config.ts` | Build config | Tailwind theme — brand color palette (earthy green / cream), Varela Round font, custom animations |
| `.env` | Secrets | Runtime env: DB URLs (Supabase Frankfurt), Clerk keys, PayPlus keys, SMTP, cron secret |
| `full_site_backup.json` | Backup artifact | Latest JSON snapshot of all tables — used as source for one-off imports/restores |
| `README.md` | Docs | This file |

### Prisma (database)

| File | Context | Target |
|------|---------|--------|
| `prisma/schema.prisma` | ORM schema | Single source of truth for all 13 models, indexes, relations, `@map` snake_case table names |
| `prisma/seed.ts` | Seed script | Populates dev DB with demo classes/users (`npm run db:seed`) |
| `prisma/reset-and-create.sql` | Manual SQL | Emergency "drop + create" SQL script to run in Supabase SQL Editor if Prisma push fails |

### Scripts

| File | Context | Target |
|------|---------|--------|
| `scripts/backup-db.ts` | Maintenance | Exports every table to `full_site_backup.json` — run before schema migrations or region changes |

### App shell & routing

| File | Context | Target |
|------|---------|--------|
| `src/app/layout.tsx` | Root layout | HTML shell: `<ClerkProvider>` with `heIL` locale, `dir="rtl"`, `lang="he"`, Varela Round font, global metadata |
| `src/app/globals.css` | Global CSS | Tailwind layers, RTL base rules, `.hide-scrollbar`, `.prose-article` rich-text styles |
| `src/app/page.tsx` | Public route `/` | Landing page — dynamic hero, feature cards, About Me, social links; uses `<Suspense>` so shell ships instantly |
| `src/proxy.ts` | Middleware | Clerk `clerkMiddleware` — protects `/admin/*`, `/profile`, `/schedule` (renamed from `middleware.ts` for Next 16) |

### Authentication pages

| File | Context | Target |
|------|---------|--------|
| `src/app/sign-in/[[...sign-in]]/page.tsx` | Public route `/sign-in` | Clerk `<SignIn>` catch-all, centered, Hebrew labels |
| `src/app/sign-up/[[...sign-up]]/page.tsx` | Public route `/sign-up` | Clerk `<SignUp>` catch-all |

### Student-facing pages (`(student)` route group)

| File | Context | Target |
|------|---------|--------|
| `src/app/(student)/layout.tsx` | Layout | Fetches user + credits once, renders `<NavbarServer>` inside `<Suspense>` for all student routes |
| `src/app/(student)/schedule/page.tsx` | Route `/schedule` | Weekly class grid, week navigation with RTL-flipped arrows, `unstable_cache` tagged `schedule` |
| `src/app/(student)/schedule/loading.tsx` | Route segment | Skeleton shown while schedule data resolves |
| `src/app/(student)/profile/page.tsx` | Route `/profile` | Personal area — current credits, booking history, active punch cards |
| `src/app/(student)/pricing/page.tsx` | Route `/pricing` | Renders `<PricingCards>` with prices pulled dynamically from `SiteSettings` |
| `src/app/(student)/payments/success/page.tsx` | Route `/payments/success` | Post-PayPlus confirmation screen, reads `?status=` query |
| `src/app/(student)/articles/page.tsx` | Route `/articles` | Magazine listing grid — image + title + excerpt, links to `[slug]` |
| `src/app/(student)/articles/[slug]/page.tsx` | Route `/articles/[slug]` | Individual article reader; `generateMetadata` for SEO; decodes Hebrew slug |
| `src/app/(student)/workshops/page.tsx` | Route `/workshops` | Workshops listing with `<RegisterButton>` per card |

### Admin pages (`(admin)` route group)

| File | Context | Target |
|------|---------|--------|
| `src/app/(admin)/layout.tsx` | Layout | Guards with `requireAdmin()`, renders `<Navbar>` + `<AdminSidebar>` (sticky sub-nav) |
| `src/app/(admin)/admin/loading.tsx` | Route segment | Skeleton shown while admin data resolves |
| `src/app/(admin)/admin/page.tsx` | Route `/admin` | Dashboard shell with `<DashboardView>` inside `<Suspense>` |
| `src/app/(admin)/admin/schedule/page.tsx` | Route `/admin/schedule` | Hosts `<ScheduleBuilder>` — create/edit/cancel recurring & one-off classes |
| `src/app/(admin)/admin/users/page.tsx` | Route `/admin/users` | Hosts `<UsersManager>` — list students, adjust credits |
| `src/app/(admin)/admin/attendance/page.tsx` | Route `/admin/attendance` | Hosts `<AttendanceView>` — mark who showed up per class instance |
| `src/app/(admin)/admin/workshops/page.tsx` | Route `/admin/workshops` | Hosts `<WorkshopsManager>` — create/edit workshops + image upload |
| `src/app/(admin)/admin/articles/page.tsx` | Route `/admin/articles` | Hosts `<ArticlesManager>` — rich-text editor + image upload |
| `src/app/(admin)/admin/settings/page.tsx` | Route `/admin/settings` | Hosts `<SettingsEditor>` — hero, feature cards, about, pricing |

### API routes — public & student

| File | Context | Target |
|------|---------|--------|
| `src/app/api/schedule/route.ts` | `GET` | Public weekly class instances feed |
| `src/app/api/bookings/route.ts` | `POST` | Book a class — validates credits/punch card, enforces capacity, adds to waitlist, sends confirmation email |
| `src/app/api/bookings/[id]/cancel/route.ts` | `POST` | Cancel booking; refunds credit if ≥ `CANCELLATION_HOURS_BEFORE` hours before class; auto-promotes waitlist |
| `src/actions/payme.ts` | Server Action | `generatePaymeSaleForWorkshop()` — creates a PENDING `WorkshopRegistration` and returns a PayMe hosted-payment URL (replaces the old `/api/workshops/register` route) |
| `src/app/api/user/credits/route.ts` | `GET` | Returns the signed-in user's credit balance (used by navbar badge) |

### API routes — admin

| File | Context | Target |
|------|---------|--------|
| `src/app/api/admin/dashboard/route.ts` | `GET` | Aggregated stats: revenue, bookings this week, popular classes |
| `src/app/api/admin/schedule/route.ts` | `GET/POST` | List class definitions / create new (recurring or one-off) |
| `src/app/api/admin/schedule/[id]/route.ts` | `GET/PUT/DELETE` | Edit or soft-delete a class definition |
| `src/app/api/admin/instances/[id]/route.ts` | `PATCH` | Cancel a single occurrence without deleting the recurring definition |
| `src/app/api/admin/users/route.ts` | `GET/PATCH` | List students / update credits balance |
| `src/app/api/admin/students/[id]/route.ts` | `POST` | Admin manually adds or removes a student from a specific class instance |
| `src/app/api/admin/attendance/[instanceId]/route.ts` | `GET/POST` | Load roster for a class instance and save attendance marks |
| `src/app/api/admin/articles/route.ts` | `GET/POST` | List articles / create (auto-generates slug from title) |
| `src/app/api/admin/articles/[id]/route.ts` | `PUT/DELETE` | Edit or delete an article; invalidates `/articles` cache |
| `src/app/api/admin/workshops/route.ts` | `GET/POST` | List / create workshops |
| `src/app/api/admin/workshops/[id]/route.ts` | `PUT/DELETE` | Edit or deactivate a workshop |
| `src/app/api/admin/settings/route.ts` | `GET/PUT` | Read/update `SiteSettings` singleton (hero, about, pricing) |
| `src/app/api/admin/feature-cards/route.ts` | `GET/PUT` | Replace-all save of homepage feature cards |
| `src/app/api/admin/upload/route.ts` | `POST` | Image upload — Supabase Storage if `SUPABASE_SERVICE_ROLE_KEY` set, otherwise base64 data URL |

### API routes — payments & webhooks

| File | Context | Target |
|------|---------|--------|
| `src/app/api/payments/checkout/route.ts` | `POST` | Creates a PayPlus payment page for a credit or punch-card purchase; creates `Payment(PENDING)` |
| `src/app/api/payments/webhook/route.ts` | `POST` | PayPlus callback — verifies signature, marks `Payment(COMPLETED)`, credits user or creates `PunchCard` |
| `src/app/api/webhooks/payme/route.ts` | `POST` | PayMe IPN callback — reads `custom_1` (registrationId), flips `WorkshopRegistration` to `COMPLETED`/`CANCELLED`, revalidates `/workshops` |
| `src/app/api/webhooks/clerk/route.ts` | `POST` | Svix-verified Clerk webhook — syncs `user.created`/`updated` to DB, assigns `ADMIN` role by email |

### API routes — cron

| File | Context | Target |
|------|---------|--------|
| `src/app/api/cron/generate-instances/route.ts` | `GET` | Auto-generates the next 12 weeks of `ClassInstance`s from recurring `ClassDefinition`s (runs weekly) |
| `src/app/api/cron/reminders/route.ts` | `GET` | Sends reminder emails 24h before each booked class (runs hourly) |

### Components — layout

| File | Context | Target |
|------|---------|--------|
| `src/components/layout/navbar.tsx` | Shared UI | Sticky top navbar, horizontal-scroll on mobile, RTL flex, `<UserButton>` or auth links — receives `isAdmin`/`credits` as props (no DB calls) |
| `src/components/layout/navbar-server.tsx` | Server wrapper | Async Server Component that fetches user + credits once per request and forwards props to `<Navbar>` |
| `src/components/layout/admin-sidebar.tsx` | Admin UI | Secondary sticky tab bar under the main navbar with active-state highlight |

### Components — admin (client forms)

| File | Context | Target |
|------|---------|--------|
| `src/components/admin/dashboard-view.tsx` | Client | Fetches `/api/admin/dashboard`, renders KPI cards with graceful empty-state |
| `src/components/admin/schedule-builder.tsx` | Client | Full CRUD form for classes (teacher, date, time, location, capacity, recurring) — inline dialogs to avoid focus-loss bug |
| `src/components/admin/users-manager.tsx` | Client | Students table with add/remove credits per row |
| `src/components/admin/attendance-view.tsx` | Client | Per-class roster with check-in toggles |
| `src/components/admin/workshops-manager.tsx` | Client | Workshop CRUD with Supabase image upload |
| `src/components/admin/articles-manager.tsx` | Client | Article CRUD with file-upload preview and rich content field |
| `src/components/admin/settings-editor.tsx` | Client | Tabbed editor for hero / about / feature cards / pricing; writes to `/api/admin/settings` and `/api/admin/feature-cards` |

### Components — student

| File | Context | Target |
|------|---------|--------|
| `src/components/schedule/book-button.tsx` | Client | Booking CTA — handles "Book", "Cancel", "Pay & Book", and waitlist states |
| `src/components/pricing/pricing-cards.tsx` | Client | Two pricing cards (single / punch card) — triggers PayPlus checkout |
| `src/components/workshops/register-button.tsx` | Client | Workshop registration + payment trigger |
| `src/components/profile/profile-view.tsx` | Client | Personal area — credits, upcoming bookings, history, active punch cards |

### Components — UI primitives

| File | Context | Target |
|------|---------|--------|
| `src/components/ui/button.tsx` | Design system | Button with `class-variance-authority` variants (primary, ghost, outline, sizes) |
| `src/components/ui/card.tsx` | Design system | `Card`, `CardHeader`, `CardContent`, `CardFooter` rounded containers |
| `src/components/ui/badge.tsx` | Design system | Status pill (success / warning / info / neutral) |
| `src/components/ui/dialog.tsx` | Design system | Radix Dialog wrapper with RTL-aware close button |
| `src/components/ui/input.tsx` | Design system | Text input with consistent focus ring + RTL padding |
| `src/components/ui/loading.tsx` | Design system | `<LoadingSpinner>` and skeleton placeholders |

### Library (`src/lib`)

| File | Context | Target |
|------|---------|--------|
| `src/lib/prisma.ts` | DB | Prisma client singleton (prevents dev hot-reload from exhausting pool) |
| `src/lib/db.ts` | DB | Re-exports `prisma` under the `db` alias used across the codebase |
| `src/lib/auth-helpers.ts` | Auth | `getSharedUser()` — cached, indexed `clerkId` lookup; `requireAuth()`, `requireAdmin()` guards with `console.time` tracing |
| `src/lib/get-db-user.ts` | Auth | Thin wrapper that reuses `getSharedUser()` (kept for backwards compat) |
| `src/lib/admin.ts` | Auth | `ADMIN_EMAILS` array + `isAdminEmail(email)` helper — single source for admin list |
| `src/lib/booking-engine.ts` | Domain | Serializable Prisma transaction for booking: capacity check, credit deduction, waitlist add, refund on cancel |
| `src/lib/schedule-service.ts` | Domain | Recurring-class expansion (generates `ClassInstance`s for a date range) |
| `src/lib/validations.ts` | Validation | Zod schemas for all API inputs (booking, class CRUD, settings, etc.) |
| `src/lib/email.ts` | Integration | Nodemailer transport — booking confirmation, waitlist promotion, class reminder templates |
| `src/lib/payplus.ts` | Integration | PayPlus API client — `createPaymentLink()`, `verifyWebhook()`, error normalization |
| `src/lib/utils.ts` | Helpers | `cn()` for Tailwind class merging + small date/formatting helpers |

## Local Development

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

If Turbopack cache gets corrupted:

```bash
Remove-Item -Recurse -Force .next   # PowerShell
rm -rf .next                         # macOS/Linux
npm run dev
```

## Useful Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npx prisma generate  # Regenerate Prisma client
npx prisma db push   # Sync schema to database
npx prisma studio    # Database browser
```
