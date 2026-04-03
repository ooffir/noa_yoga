import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import {
  Wind,
  Heart,
  ArrowLeft,
  Flower2,
} from "lucide-react";

export const revalidate = 3600;

function InstagramBrandIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function WhatsAppBrandIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="currentColor"
    >
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.07 0C5.5 0 .17 5.33.17 11.9c0 2.1.55 4.15 1.6 5.97L0 24l6.32-1.66a11.84 11.84 0 0 0 5.75 1.47h.01c6.56 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.17-3.46-8.43Zm-8.45 18.33h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.75.98 1-3.65-.24-.38a9.87 9.87 0 0 1-1.52-5.27C2.14 6.43 6.58 2 12.06 2c2.64 0 5.13 1.03 7 2.9a9.83 9.83 0 0 1 2.9 7c0 5.48-4.44 9.91-9.89 9.91Zm5.43-7.42c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.08-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.62.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.69.25-1.28.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

export default async function LandingPage() {
  return (
    <div className="min-h-screen bg-sand-50">
      <nav
        dir="rtl"
        className="sticky top-0 z-50 border-b border-sage-100/50 bg-white/80 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
          <div className="flex shrink-0 items-center gap-2">
            <Show when="signed-in">
              <Link
                href="/profile"
                className="rounded-2xl bg-sage-100 px-3 py-1.5 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-200"
              >
                אזור אישי
              </Link>
              <UserButton />
            </Show>
            <Show when="signed-out">
              <Link
                href="/sign-in"
                className="rounded-2xl bg-sage-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sage-700 sm:px-3 sm:text-sm"
              >
                התחברות
              </Link>
              <Link
                href="/sign-up"
                className="rounded-2xl border border-sage-200 px-2.5 py-1.5 text-xs font-medium text-sage-600 transition-colors hover:bg-sage-50 sm:px-3 sm:text-sm"
              >
                הרשמה
              </Link>
            </Show>
          </div>

          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-sage-800"
            aria-label="נועה יוגה"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
              <Flower2 className="h-4 w-4" />
            </span>
            <span className="hidden text-lg font-bold sm:block">נועה יוגה</span>
          </Link>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-sage-50 via-white to-sand-100" />
        <div className="absolute top-[-6rem] right-[-6rem] h-[28rem] w-[28rem] rounded-full bg-sage-100/30 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-[-8rem] h-[32rem] w-[32rem] rounded-full bg-sand-200/20 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-4 py-20 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-sage-200 bg-white/70 px-4 py-1.5 text-xs font-medium text-sage-600 backdrop-blur-sm mb-8">
            <Heart className="h-3.5 w-3.5 text-brand-400" />
            נשימה · תנועה · איזון
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-sage-900 leading-[1.2] max-w-2xl mx-auto">
            המסע אל השקט הפנימי
            <span className="block text-sage-600 mt-1">מתחיל בנשימה</span>
          </h1>

          <p className="mt-6 text-lg text-sage-500 leading-relaxed max-w-lg mx-auto">
            הצטרפו לקהילת היוגה שלנו. מרחב של תנועה מודעת, התבוננות וחיבור
            לכאן ועכשיו. מקום לשחרר את העבר, לא לדאוג מהעתיד, ופשוט לנשום את
            ההווה.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/schedule"
              className="group flex items-center gap-2 rounded-3xl bg-sage-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-sage-600/20 hover:bg-sage-700 hover:shadow-xl transition-all"
            >
              הזמינו מקום לשיעור
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-sage-900">למה לתרגל איתנו</h2>
          <p className="mt-3 text-sage-500">חוויית יוגה מקצועית ואישית – כל שיעור בנוי בשבילך</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Wind,
              title: "הכל משתנה (ארעיות)",
              desc: "ויניאסה דינמית שמלמדת אותנו לשחרר, להרפות, ולהיות בתנועה מתמדת יחד עם קצב החיים.",
              color: "bg-sage-50 text-sage-600",
            },
            {
              icon: Heart,
              title: "כשהנשימה שקטה, התודעה שקטה",
              desc: "תרגול הממקד את תשומת הלב פנימה, אל השאיפה והנשיפה. כאן ועכשיו, הרגע הזה הוא כל מה שיש.",
              color: "bg-sand-50 text-sand-700",
            },
            {
              icon: Flower2,
              title: "דרך האמצע",
              desc: "איזון עדין בין מאמץ לשחרור. תרגול המותאם לכל הרמות ומאפשר לכל אחד ואחת למצוא את המרכז של עצמו.",
              color: "bg-brand-50 text-brand-600",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl border border-sage-100 bg-white p-7 shadow-sm hover:shadow-md transition-all">
              <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${f.color} mb-4`}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-sage-900 mb-1.5">{f.title}</h3>
              <p className="text-sm text-sage-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="rounded-4xl bg-gradient-to-bl from-sage-600 to-sage-700 p-10 sm:p-14 text-center text-white">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">מוכנה להתחיל?</h2>
          <p className="text-sage-200 max-w-md mx-auto mb-8">
            הצטרפו עוד היום למרחב של נשימה, קשב ותנועה מודעת.
          </p>
          <Link
            href="/schedule"
            className="inline-flex items-center gap-2 rounded-3xl bg-white px-8 py-4 text-base font-semibold text-sage-700 shadow-lg hover:bg-sage-50 transition-all"
          >
            צפייה במערכת השעות
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-14">
        <div className="rounded-4xl border border-sage-100 bg-white p-8 sm:p-10 shadow-sm">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-sage-900">להישאר קרובים לקהילה</h2>
            <p className="mt-2 text-sm leading-relaxed text-sage-500">
              תכנים, עדכונים, רגעי השראה ותזכורות לחזור לנשימה גם מחוץ למזרן.
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <a
              href="https://www.instagram.com/noaoffir/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-3xl border border-sage-200 bg-sage-50 px-5 py-4 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-100"
            >
              <InstagramBrandIcon />
              האינסטגרם שלי
            </a>
            <a
              href="https://chat.whatsapp.com/F0VZnlRRPbg9td08thtOjK"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-3xl border border-sage-200 bg-sage-50 px-5 py-4 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-100"
            >
              <WhatsAppBrandIcon />
              הצטרפו לקבוצת הווצאפ השקטה
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-sage-100 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sage-400 text-sm">© {new Date().getFullYear()} נועה יוגה. כל הזכויות שמורות.</span>
          <div className="flex items-center gap-6 text-sm text-sage-400">
            <Link href="/schedule" className="hover:text-sage-600 transition-colors">מערכת שעות</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
