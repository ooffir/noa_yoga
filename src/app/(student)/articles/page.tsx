import { prisma } from "@/lib/prisma";
import { Newspaper } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export const revalidate = 60;

export default async function ArticlesPage() {
  let articles: { id: string; title: string; slug: string; imageUrl: string | null; createdAt: Date }[] = [];
  try {
    articles = await prisma.article.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, slug: true, imageUrl: true, createdAt: true },
    });
  } catch (err) {
    console.error("[articles] DB unreachable, rendering empty state:", err instanceof Error ? err.message : err);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-sage-900">תכנים נוספים</h1>
        <p className="mt-3 text-sm leading-relaxed text-sage-500">
          כתבות, השראה ותוכן מעולם היוגה והמיינדפולנס
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-3xl border border-sage-100 bg-white p-14 text-center shadow-sm">
          <Newspaper className="mx-auto mb-4 h-10 w-10 text-sage-200" />
          <p className="text-lg font-medium text-sage-500">עוד לא הועלו כתבות</p>
          <p className="mt-1 text-sm text-sage-400">בקרוב כאן יופיעו תכנים מעניינים</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/articles/${article.slug}`}
              className="group block overflow-hidden rounded-3xl border border-sage-100 bg-white shadow-sm transition-all hover:shadow-md active:scale-[0.99]"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-sage-50">
                {article.imageUrl ? (
                  <Image
                    src={article.imageUrl}
                    alt={article.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Newspaper className="h-10 w-10 text-sage-200" />
                  </div>
                )}
              </div>
              <div className="p-5">
                <h2 className="text-base font-bold leading-relaxed text-sage-900">
                  {article.title}
                </h2>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
