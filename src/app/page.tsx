import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Show, UserButton, ClerkLoaded } from "@clerk/nextjs";
import {
  Wind, Heart, ArrowLeft, Flower2, Sun, Leaf, Sparkles,
  Star, Moon, Mountain, Waves, Eye, Hand,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Wind, Heart, Flower2, Sun, Leaf, Sparkles,
  Star, Moon, Mountain, Waves, Eye, Hand,
};

const ICON_COLORS = [
  "bg-sage-50 text-sage-600",
  "bg-sand-50 text-sand-700",
  "bg-brand-50 text-brand-600",
  "bg-sage-100 text-sage-700",
  "bg-sand-100 text-sand-600",
  "bg-brand-100 text-brand-700",
];

function getIcon(name: string) {
  return ICON_MAP[name] || Heart;
}

// Always render fresh content from the DB on every request.
// Admin edits go live instantly — no build-time caching, no stale ISR snapshot.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Per-page metadata — overrides the root layout defaults. Shows up in
// browser tabs, Google search results, and WhatsApp / Facebook link previews.
export const metadata: Metadata = {
  title: "יוגה בחיפה — סטודיו Noa Yogis בהנחיית נועה אופיר",
  description:
    "סטודיו יוגה בחיפה בהנחיית נועה אופיר. שיעורי Vinyasa ו-Hatha, כרטיסיות חודשיות, סדנאות ייעודיות. הרשמה אונליין בלחיצה אחת — בואו לתרגל איתנו.",
  keywords: [
    "יוגה בחיפה",
    "סטודיו יוגה חיפה",
    "שיעורי יוגה בחיפה",
    "יוגה לנשים חיפה",
    "Vinyasa חיפה",
    "סדנאות יוגה",
    "נועה אופיר",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "יוגה בחיפה — Noa Yogis",
    description:
      "סטודיו יוגה בחיפה. שיעורי Vinyasa, Hatha, כרטיסיות וסדנאות — הרשמה אונליין מהירה.",
    url: "/",
    type: "website",
    images: [
      {
        url: "/yoga-pose.png",
        width: 1200,
        height: 630,
        alt: "Noa Yogis — סטודיו יוגה בחיפה",
      },
    ],
  },
};

function InstagramBrandIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function WhatsAppBrandIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.07 0C5.5 0 .17 5.33.17 11.9c0 2.1.55 4.15 1.6 5.97L0 24l6.32-1.66a11.84 11.84 0 0 0 5.75 1.47h.01c6.56 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.17-3.46-8.43Zm-8.45 18.33h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.75.98 1-3.65-.24-.38a9.87 9.87 0 0 1-1.52-5.27C2.14 6.43 6.58 2 12.06 2c2.64 0 5.13 1.03 7 2.9a9.83 9.83 0 0 1 2.9 7c0 5.48-4.44 9.91-9.89 9.91Zm5.43-7.42c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.08-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.62.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.69.25-1.28.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

function renderAboutContent(text: string) {
  const paragraphs = text.split("\n").filter((l) => l.trim());
  return paragraphs.map((p, i) => <p key={i}>{p}</p>);
}

// ───── Main page — synchronous server render, no hydration flash ─────

export default async function LandingPage() {
  // Single parallel fetch — the server blocks until we have fresh DB values.
  // The HTML sent to the browser already contains the correct content,
  // so there is no "old text → new text" flash on hydration.
  let settings: {
    heroTitle: string | null;
    heroSubtitle: string | null;
    cardsHeading: string | null;
    cardsSubheading: string | null;
    aboutTitle: string | null;
    aboutSubtitle: string | null;
    aboutContent: string | null;
    profileImageUrl: string | null;
  } | null = null;
  let cards: { title: string; description: string; iconName: string }[] = [];

  try {
    [settings, cards] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { id: "main" },
        select: {
          heroTitle: true,
          heroSubtitle: true,
          cardsHeading: true,
          cardsSubheading: true,
          aboutTitle: true,
          aboutSubtitle: true,
          aboutContent: true,
          profileImageUrl: true,
        },
      }),
      prisma.featureCard.findMany({
        orderBy: { order: "asc" },
        select: { title: true, description: true, iconName: true },
      }),
    ]);
  } catch (err) {
    console.error("[landing] DB unreachable, rendering empty state:", err instanceof Error ? err.message : err);
  }

  // Empty-string fallbacks — better a blank space for 200ms than stale hardcoded text.
  const heroTitle = settings?.heroTitle || "";
  const heroSubtitle = settings?.heroSubtitle || "";
  const cardsHeading = settings?.cardsHeading || "";
  const cardsSubheading = settings?.cardsSubheading || "";
  const aboutTitle = settings?.aboutTitle || "";
  const aboutSubtitle = settings?.aboutSubtitle || "";
  const aboutContent = settings?.aboutContent || "";
  const profileImage = settings?.profileImageUrl || null;

  const page = (
    <div className="min-h-screen bg-sand-50">
      {/* ── כותרת עליונה ── */}
      <nav dir="rtl" className="sticky top-0 z-[100] border-b border-sage-100 bg-[#FDFBF7]">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
          <div className="flex shrink-0 items-center gap-2">
            <Show when="signed-in">
              <Link href="/profile" className="rounded-2xl bg-sage-100 px-3 py-1.5 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-200">
                אזור אישי
              </Link>
              {/*
               * Wrap UserButton in ClerkLoaded so it only renders after
               * Clerk's JS bundle has hydrated on the client. Without this,
               * the SSR placeholder differs from the client-side avatar
               * widget (refs / portals), producing a noisy "Hydration
               * failed" error in dev. The error is recoverable in prod but
               * pollutes the console — this fix removes it cleanly.
               */}
              <ClerkLoaded>
                <UserButton />
              </ClerkLoaded>
            </Show>
            <Show when="signed-out">
              <Link href="/sign-in" className="rounded-2xl bg-sage-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sage-700 active:scale-[0.97]">
                התחברות
              </Link>
              <Link href="/sign-up" className="rounded-2xl border border-sage-200 px-3 py-2 text-sm font-medium text-sage-600 transition-colors hover:bg-sage-50 active:scale-[0.97]">
                הרשמה
              </Link>
            </Show>
          </div>
          <Link href="/" className="flex shrink-0 items-center text-lg font-bold text-sage-800" aria-label="Noa Yogis">
            Noa Yogis
          </Link>
        </div>
      </nav>

      {/* ── גיבור ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-sage-50 via-white to-sand-100" />
        <div className="absolute -top-24 -right-24 h-[28rem] w-[28rem] rounded-full bg-sage-100/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-[32rem] w-[32rem] rounded-full bg-sand-200/20 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-5 pt-2 pb-12 text-center sm:pt-4 sm:pb-16">
          <div className="flex justify-center mb-2">
            <Image
              src="/yoga-pose.png"
              alt="יוגה"
              width={220}
              height={260}
              className="mix-blend-multiply"
              priority
            />
          </div>

          {heroSubtitle && (
            <p className="mx-auto mb-4 max-w-lg text-lg leading-relaxed text-sage-500">
              {heroSubtitle}
            </p>
          )}

          {heroTitle && (
            <h1 className="mx-auto max-w-4xl text-pretty text-4xl font-bold leading-snug tracking-tight text-sage-900 sm:text-5xl md:text-6xl md:leading-[1.15]">
              {heroTitle.includes("\n") ? (
                <>
                  {heroTitle.split("\n")[0]}
                  <span className="mt-2 block text-sage-600">{heroTitle.split("\n").slice(1).join(" ")}</span>
                </>
              ) : (
                heroTitle
              )}
            </h1>
          )}

          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/schedule"
              className="group inline-flex items-center gap-2 rounded-3xl bg-sage-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-sage-600/20 transition-all hover:bg-sage-700 hover:shadow-xl active:scale-[0.97]"
            >
              הזמינו מקום לשיעור
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            </Link>
            <Link
              href="/articles"
              className="inline-flex items-center gap-2 rounded-3xl border-2 border-sage-200 bg-white px-8 py-4 text-base font-semibold text-sage-700 transition-all hover:border-sage-300 hover:bg-sage-50 active:scale-[0.97]"
            >
              מגזין Noa Yogis
            </Link>
          </div>
        </div>
      </section>

      {/* ── כרטיסי ערך ── */}
      {(cardsHeading || cards.length > 0) && (
        <section className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
          {(cardsHeading || cardsSubheading) && (
            <div className="mb-16 text-center">
              {cardsHeading && (
                <h2 className="text-3xl font-bold tracking-tight text-sage-900 sm:text-4xl">{cardsHeading}</h2>
              )}
              {cardsSubheading && (
                <p className="mt-4 text-sage-500 leading-relaxed">{cardsSubheading}</p>
              )}
            </div>
          )}

          {cards.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card, idx) => {
                const IconComponent = getIcon(card.iconName);
                const color = ICON_COLORS[idx % ICON_COLORS.length];
                return (
                  <div key={idx} className="rounded-3xl border border-sage-100 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
                    <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${color}`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-sage-900">{card.title}</h3>
                    <p className="text-sm leading-relaxed text-sage-500">{card.description}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── נעים להכיר ── */}
      {(aboutTitle || aboutContent) && (
        <section className="mx-auto max-w-5xl px-5 pb-24">
          <div className="rounded-[2rem] border border-sage-100 bg-white p-8 shadow-sm sm:p-12">
            {(aboutTitle || aboutSubtitle) && (
              <div className="mb-10 text-center">
                {aboutTitle && (
                  <h2 className="text-3xl font-bold tracking-tight text-sage-900">{aboutTitle}</h2>
                )}
                {aboutSubtitle && (
                  <p className="mt-3 text-sm leading-relaxed text-sage-500">{aboutSubtitle}</p>
                )}
              </div>
            )}

            <div className="flex flex-col items-center gap-10 md:flex-row md:items-start">
              {profileImage && (
                <div className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profileImage}
                    alt={aboutTitle || "profile"}
                    className="h-48 w-48 rounded-3xl object-cover shadow-sm md:h-56 md:w-56"
                  />
                </div>
              )}

              {aboutContent && (
                <div className="flex-1 space-y-1 text-right text-[15px] font-light leading-[2] text-sage-600">
                  {aboutContent.includes("<") ? (
                    <div dangerouslySetInnerHTML={{ __html: aboutContent }} />
                  ) : (
                    renderAboutContent(aboutContent)
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── קריאה לפעולה ── */}
      <section className="mx-auto max-w-5xl px-5 pb-24">
        <div className="rounded-[2rem] bg-gradient-to-bl from-sage-600 to-sage-700 p-10 text-center text-white sm:p-14">
          <h2 className="text-3xl font-bold sm:text-4xl">מוכנים להתחיל?</h2>
          <p className="mx-auto mt-4 max-w-md text-sage-200 leading-relaxed">
            הצטרפו עוד היום למרחב של נשימה, קשב ותנועה מודעת.
          </p>
          <div className="mt-10">
            <Link
              href="/schedule"
              className="inline-flex items-center gap-2 rounded-3xl bg-white px-8 py-4 text-base font-semibold text-sage-700 shadow-lg transition-all hover:bg-sage-50 active:scale-[0.97]"
            >
              צפייה במערכת השעות
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── קהילה ── */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="rounded-[2rem] border border-sage-100 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-sage-900">להישאר קרובים לקהילה</h2>
            <p className="mt-3 text-sm leading-relaxed text-sage-500">
              תכנים, עדכונים, רגעי השראה ותזכורות לחזור לנשימה גם מחוץ למזרן.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <a
              href="https://www.instagram.com/noaoffir/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 rounded-3xl border border-sage-200 bg-sage-50 px-5 py-4 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-100 active:scale-[0.98]"
            >
              <InstagramBrandIcon />
              האינסטגרם שלי
            </a>
            <a
              href="https://chat.whatsapp.com/F0VZnlRRPbg9td08thtOjK"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 rounded-3xl border border-sage-200 bg-sage-50 px-5 py-4 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-100 active:scale-[0.98]"
            >
              <WhatsAppBrandIcon />
              הצטרפו לקבוצת הווצאפ השקטה
            </a>
          </div>
        </div>
      </section>

      {/* ── פוטר ── */}
      <footer className="border-t border-sage-100 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <span className="text-sm text-sage-400">© {new Date().getFullYear()} Noa Yogis. כל הזכויות שמורות.</span>
          <Link href="/schedule" className="text-sm text-sage-400 transition-colors hover:text-sage-600">מערכת שעות</Link>
        </div>
      </footer>
    </div>
  );

  return page;
}
