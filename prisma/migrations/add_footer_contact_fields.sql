-- ═════════════════════════════════════════════════════════════════════
--  Migration — Footer contact info editable from admin panel
--
--  Adds 4 new columns to site_settings so Noa can change the email,
--  phone, Instagram, and WhatsApp links from the admin settings page
--  without a code deploy.
--
--  Safe to run repeatedly (IF NOT EXISTS is idempotent).
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS contact_email  TEXT NOT NULL DEFAULT 'noayogaa@gmail.com',
  ADD COLUMN IF NOT EXISTS contact_phone  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_url  TEXT NOT NULL DEFAULT 'https://www.instagram.com/noaoffir/',
  ADD COLUMN IF NOT EXISTS whatsapp_url   TEXT NOT NULL DEFAULT 'https://chat.whatsapp.com/F0VZnlRRPbg9td08thtOjK';

INSERT INTO public.site_settings (id)
VALUES ('main')
ON CONFLICT (id) DO NOTHING;
