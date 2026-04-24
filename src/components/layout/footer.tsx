import Link from "next/link";
import { Instagram, MessageCircle, Mail, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";

// Fallbacks used when (a) the DB read fails OR (b) the column doesn't
// exist yet (between deploying this code and running the migration SQL).
const DEFAULTS = {
  contactEmail: "noayogaa@gmail.com",
  contactPhone: "",
  instagramUrl: "https://www.instagram.com/noaoffir/",
  whatsappUrl: "https://chat.whatsapp.com/F0VZnlRRPbg9td08thtOjK",
} as const;

/**
 * Site-wide footer — server component, rendered once in the (student)
 * layout. Reads contact info from SiteSettings so Noa can change it
 * from `/admin/settings` without a redeploy.
 *
 * Compliance: PayMe/Israeli consumer law expects visible ToS /
 * Privacy / Refund-policy links on every page before approving a
 * merchant account — those links are hardcoded to their static pages
 * (`/terms`, `/privacy`, `/refund-policy`), not admin-editable.
 */
export async function Footer() {
  const year = new Date().getFullYear();

  // Defensive read: if the DB is unreachable OR the contact columns
  // don't exist yet (pre-migration), fall back to the bundled defaults.
  let settings: {
    contactEmail: string;
    contactPhone: string;
    instagramUrl: string;
    whatsappUrl: string;
  } = { ...DEFAULTS };
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: "main" },
      select: {
        contactEmail: true,
        contactPhone: true,
        instagramUrl: true,
        whatsappUrl: true,
      },
    });
    if (row) {
      settings = {
        contactEmail: row.contactEmail || DEFAULTS.contactEmail,
        contactPhone: row.contactPhone || "",
        instagramUrl: row.instagramUrl || DEFAULTS.instagramUrl,
        whatsappUrl: row.whatsappUrl || DEFAULTS.whatsappUrl,
      };
    }
  } catch {
    // Swallow — footer must never crash a page render. Defaults win.
  }

  return (
    <footer
      dir="rtl"
      className="mt-16 border-t border-sage-100 bg-white"
    >
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          {/* ── Studio blurb + social icons ── */}
          <div>
            <h3 className="text-lg font-bold text-sage-900">Noa Yogis</h3>
            <p className="mt-2 text-sm leading-relaxed text-sage-500">
              סטודיו יוגה בהנחיית נועה אופיר — תרגול, נשימה ונוכחות בתוך
              היומיום.
            </p>
            <div className="mt-4 flex items-center gap-3">
              {settings.instagramUrl && (
                <a
                  href={settings.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-50 text-sage-600 transition-colors hover:bg-sage-100"
                >
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {settings.whatsappUrl && (
                <a
                  href={settings.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-50 text-sage-600 transition-colors hover:bg-sage-100"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
              {settings.contactEmail && (
                <a
                  href={`mailto:${settings.contactEmail}`}
                  aria-label="Email"
                  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-50 text-sage-600 transition-colors hover:bg-sage-100"
                >
                  <Mail className="h-4 w-4" />
                </a>
              )}
              {settings.contactPhone && (
                <a
                  href={`tel:${settings.contactPhone.replace(/\D/g, "")}`}
                  aria-label="Phone"
                  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-50 text-sage-600 transition-colors hover:bg-sage-100"
                >
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* ── Navigation ── */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-sage-700">
              ניווט
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <FooterLink href="/" label="עמוד הבית" />
              <FooterLink href="/schedule" label="מערכת שעות" />
              <FooterLink href="/pricing" label="מחירון" />
              <FooterLink href="/workshops" label="סדנאות" />
              <FooterLink href="/articles" label="מגזין" />
            </ul>
          </div>

          {/* ── Legal + direct contact ── */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-sage-700">
              מידע משפטי
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <FooterLink href="/terms" label="תקנון ותנאי שימוש" />
              <FooterLink href="/privacy" label="מדיניות פרטיות" />
              <FooterLink href="/refund-policy" label="מדיניות ביטולים" />
              {settings.contactEmail && (
                <li>
                  <a
                    href={`mailto:${settings.contactEmail}`}
                    className="text-sage-500 transition-colors hover:text-sage-700"
                  >
                    {settings.contactEmail}
                  </a>
                </li>
              )}
              {settings.contactPhone && (
                <li dir="ltr" className="text-right">
                  <a
                    href={`tel:${settings.contactPhone.replace(/\D/g, "")}`}
                    className="text-sage-500 transition-colors hover:text-sage-700"
                  >
                    {settings.contactPhone}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-sage-100 pt-6 sm:flex-row">
          <span className="text-xs text-sage-400">
            © {year} Noa Yogis. כל הזכויות שמורות.
          </span>
          <span className="text-xs text-sage-400">
            תשלומים מאובטחים ע&quot;י{" "}
            <a
              href="https://payme.io"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sage-600 hover:text-sage-800"
            >
              PayMe
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sage-500 transition-colors hover:text-sage-700"
      >
        {label}
      </Link>
    </li>
  );
}
