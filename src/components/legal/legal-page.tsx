import { format } from "date-fns";
import { he } from "date-fns/locale";

/**
 * Shared wrapper for the three legal pages (ToS, Privacy, Refunds).
 * Provides consistent RTL typography, heading scale, and sage-palette
 * styling so the pages feel like one legal set instead of three
 * inconsistent docs.
 */
interface LegalPageProps {
  title: string;
  lastUpdated: Date;
  children: React.ReactNode;
}

export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-8 border-b border-sage-100 pb-6">
        <h1 className="text-3xl font-bold text-sage-900 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-sage-500">
          עדכון אחרון:{" "}
          {format(lastUpdated, "d בMMMM yyyy", { locale: he })}
        </p>
      </header>

      <article
        dir="rtl"
        className="space-y-6 text-[15px] leading-[1.9] text-sage-700
          [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-sage-900
          [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-sage-800
          [&_p]:leading-[1.9]
          [&_ul]:list-disc [&_ul]:pr-5 [&_ul]:space-y-1.5 [&_ul]:my-2
          [&_ol]:list-decimal [&_ol]:pr-5 [&_ol]:space-y-1.5 [&_ol]:my-2
          [&_strong]:text-sage-900 [&_strong]:font-semibold
          [&_a]:text-sage-700 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-sage-900"
      >
        {children}
      </article>
    </div>
  );
}
