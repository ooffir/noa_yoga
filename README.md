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
| `POST /api/workshops/register` | Register for a workshop |
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
| `POST /api/payments/checkout` | PayPlus payment page creation |
| `POST /api/payments/webhook` | PayPlus payment webhook |
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
