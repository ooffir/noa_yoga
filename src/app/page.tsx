import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { Calendar, Heart, ArrowLeft, CreditCard, Clock, Flower2 } from "lucide-react";

export const revalidate = 3600;

export default async function LandingPage() {
  return (
    <div className="min-h-screen bg-sand-50">
      <nav className="sticky top-0 z-50 border-b border-sage-100/50 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl flex-row-reverse items-center justify-between gap-2 px-4">
          <div className="shrink-0">
            <Link
              href="/"
              className="flex items-center gap-2 text-sage-800"
              aria-label="נועה יוגה"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
                <Flower2 className="h-4 w-4" />
              </span>
              <span className="hidden text-lg font-bold sm:block">נועה יוגה</span>
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-3 overflow-hidden">
            <Show when="signed-in">
              <Link
                href="/profile"
                className="rounded-2xl bg-sage-100 px-4 py-2 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-200"
              >
                אזור אישי
              </Link>
            </Show>
            <Show when="signed-out">
              <div className="flex items-center gap-2">
                <Link
                  href="/sign-in"
                  className="rounded-2xl bg-sage-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-sage-700 sm:px-4 sm:text-sm"
                >
                  התחברות
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-2xl border border-sage-200 px-3 py-2 text-xs font-medium text-sage-600 transition-colors hover:bg-sage-50 sm:px-4 sm:text-sm"
                >
                  הרשמה
                </Link>
              </div>
            </Show>
          </div>

          <div className="z-10 flex shrink-0 items-center gap-2">
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
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
            מצאי את
            <span className="block text-sage-600 mt-1">השקט הפנימי</span>
          </h1>

          <p className="mt-6 text-lg text-sage-500 leading-relaxed max-w-lg mx-auto">
            הצטרפי לקהילת היוגה שלנו. שיעורים לכל הרמות – מזרימה עדינה ועד
            אשטנגה דינמית. מקום להתחדשות, נשימה ואיזון.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/schedule"
              className="group flex items-center gap-2 rounded-3xl bg-sage-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-sage-600/20 hover:bg-sage-700 hover:shadow-xl transition-all"
            >
              הזמיני מקום לשיעור הבא
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
            { icon: Calendar, title: "לוח זמנים גמיש", desc: "שיעורים בבוקר, בצהריים ובערב – תמיד יש שעה שמתאימה ליומן שלך.", color: "bg-sage-50 text-sage-600" },
            { icon: CreditCard, title: "שיעור בודד או כרטיסייה", desc: "שלמי לפי שיעור בודד, או רכשי כרטיסיית 10 שיעורים בהנחה.", color: "bg-sand-50 text-sand-700" },
            { icon: Clock, title: "הרשמה מהירה", desc: "הזמיני מקום בלחיצה אחת מהנייד. ביטול חינם עד 6 שעות לפני השיעור.", color: "bg-brand-50 text-brand-600" },
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
          <p className="text-sage-200 max-w-md mx-auto mb-8">הצטרפי עוד היום – ניפגש על המזרן.</p>
          <Link
            href="/schedule"
            className="inline-flex items-center gap-2 rounded-3xl bg-white px-8 py-4 text-base font-semibold text-sage-700 shadow-lg hover:bg-sage-50 transition-all"
          >
            צפייה במערכת השעות
            <ArrowLeft className="h-4 w-4" />
          </Link>
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
