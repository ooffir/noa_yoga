# Noa Yoga

`Noa Yoga` is a Hebrew-first, RTL yoga booking application built with Next.js, Clerk, Prisma, and Supabase.

It includes:
- public landing page
- protected student schedule
- bookings, waitlist, credits, and punch cards
- admin dashboard for class scheduling and student credit management
- Stripe checkout hooks for paid flows

## Current Stack

| Layer | Technology |
|-------|------------|
| App | Next.js 16 + App Router + TypeScript |
| Auth | Clerk |
| DB | Supabase Postgres + Prisma |
| UI | Tailwind CSS + Radix UI |
| Icons | `lucide-react` |
| Forms/Validation | Zod |
| Payments | Stripe Checkout |
| Email | Nodemailer |

## Main Routes

### Public

- `/` — landing page
- `/sign-in` — Clerk sign-in
- `/sign-up` — Clerk sign-up

### Student

- `/schedule` — מערכת שעות
- `/profile` — אזור אישי
- `/pricing` — רכישת קרדיטים / כרטיסיות
- `/payments/success` — דף הצלחת תשלום

### Admin

- `/admin` — לוח בקרה
- `/admin/schedule` — ניהול שיעורים
- `/admin/users` — ניהול תלמידות וקרדיטים
- `/admin/attendance` — נוכחות

## Required Environment Variables

Minimum local setup:

```env
DATABASE_URL=
DIRECT_URL=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

NEXT_PUBLIC_APP_URL=http://localhost:3000

STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_SINGLE_CLASS_PRICE_ID=
STRIPE_PUNCH_CARD_PRICE_ID=

CANCELLATION_HOURS_BEFORE=6
PUNCH_CARD_CREDITS=10
```

## Local Development

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

If you changed Prisma fields and see runtime errors such as `column does not exist`, run:

```bash
npx prisma db push
npx prisma generate
```

## Database Notes

Relevant recent fields:

- `users.credits`
- `class_definitions.is_recurring`
- `class_instances.location`

Helpful SQL files:

- `prisma/add-is-recurring.sql`
- `prisma/add-credits-and-location.sql`
- `prisma/reset-and-create.sql` — destructive full reset

## Auth Notes

- Clerk is configured in `src/app/layout.tsx`
- public auth pages live at:
  - `src/app/sign-in/[[...sign-in]]/page.tsx`
  - `src/app/sign-up/[[...sign-up]]/page.tsx`
- protected routes are enforced in `src/proxy.ts`
- admin user is hardcoded by email:
  - `omer609994@gmail.com`

## Booking Logic

Current booking order:

1. Use direct `user.credits` if available
2. Otherwise use active punch card credits
3. If class is full, add to waitlist
4. If no credits exist, prompt the user to go to payment

## Current Known Issues

- Clerk server calls via `currentUser()` can still be a performance bottleneck on server-rendered pages. It is now guarded against crashes, but the ideal next step is to move more identity data into session claims / Clerk metadata and avoid extra round trips.
- `prisma/seed.ts` still reflects an older local-password demo flow and should be updated or removed since the app now uses Clerk.
- Pricing flow currently routes the user to `/pricing` when they have no credits. A tighter “pay and immediately reserve the exact class” flow still needs a dedicated Stripe single-class checkout + post-payment booking handoff.
- The landing page and student header are stable, but the auth UI styling still relies mostly on Clerk defaults inside the sign-in/sign-up pages. If you want a fully branded auth experience, custom Clerk appearance config should be added.
- Some older utility/API messages are still in English internally, even though the visible UI is mostly Hebrew.

## Recommended Next Level-Up

High-value improvements I’d prioritize next:

1. Replace repeated `currentUser()` calls with a single session/claims-based user resolver.
2. Add a real post-payment booking reservation flow so “pay & book” completes the booking automatically.
3. Add automated tests for:
   - booking with credits
   - waitlist promotion
   - cancellation refund behavior
   - admin recurring class creation
4. Move admin mutations to server actions or a typed mutation layer.
5. Add Sentry/logging so production runtime errors are visible immediately.
6. Refresh `prisma/seed.ts` and remove remaining legacy auth assumptions.

## Useful Commands

```bash
npm run dev
npm run build
npx prisma generate
npx prisma db push
npx prisma studio
```
