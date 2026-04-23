import Link from "next/link";
import { Instagram, MessageCircle, Mail } from "lucide-react";

const CONTACT_EMAIL = "noayogaa@gmail.com";
const INSTAGRAM_URL = "https://www.instagram.com/noaoffir/";
const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/F0VZnlRRPbg9td08thtOjK";

/**
 * Site-wide footer — rendered in the (student) layout so it appears on
 * every public & logged-in page. Critical for payment-provider compliance:
 * PayMe and other Israeli merchants require visible ToS / Privacy /
 * Refund-policy links on every page before approving a merchant account.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      dir="rtl"
      className="mt-16 border-t border-sage-100 bg-white"
    >
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          {/* ── Studio blurb ── */}
          <div>
            <h3 className="text-lg font-bold text-sage-900">Noa Yogis</h3>
            <p className="mt-2 text-sm leading-relaxed text-sage-500">
              סטודיו יוגה בהנחיית נועה אופיר — תרגול, נשימה ונוכחות בתוך
              היומיום.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-50 text-sage-600 transition-colors hover:bg-sage-100"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href={WHATSAPP_GROUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-50 text-sage-600 transition-colors hover:bg-sage-100"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                aria-label="Email"
                className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-50 text-sage-600 transition-colors hover:bg-sage-100"
              >
                <Mail className="h-4 w-4" />
              </a>
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

          {/* ── Legal ── */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-sage-700">
              מידע משפטי
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <FooterLink href="/terms" label="תקנון ותנאי שימוש" />
              <FooterLink href="/privacy" label="מדיניות פרטיות" />
              <FooterLink href="/refund-policy" label="מדיניות ביטולים" />
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-sage-500 transition-colors hover:text-sage-700"
                >
                  צור קשר
                </a>
              </li>
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
