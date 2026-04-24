-- ═════════════════════════════════════════════════════════════════════
--  Migration — Email dispatch settings (reminder timing + templates)
--
--  Adds 5 new columns to site_settings. Safe to run repeatedly
--  (ADD COLUMN IF NOT EXISTS is idempotent).
--
--  Paste into Supabase SQL editor and click RUN. Then redeploy —
--  the Prisma client generated locally already knows about these
--  columns (ran `npx prisma generate`), so the Next.js app will
--  read/write them on first request.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS reminder_hour              INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS reminder_days_before       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS email_template_reminder     TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_template_promotion    TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_template_cancellation TEXT    NOT NULL DEFAULT '';

-- Backfill: ensure the singleton row "main" has the new defaults.
-- Existing row keeps its current values for unaffected columns.
INSERT INTO public.site_settings (id)
VALUES ('main')
ON CONFLICT (id) DO NOTHING;
