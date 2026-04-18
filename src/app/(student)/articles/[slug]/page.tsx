import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  let article: { title: string } | null = null;
  try {
    article = await prisma.article.findUnique({
      where: { slug: decoded },
      select: { title: true },
    });
  } catch {}

  if (!article) return { title: "כתבה לא נמצאה" };

  return {
    title: `${article.title} | Noa Yogis`,
    description: article.title,
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  let article = null;
  try {
    article = await prisma.article.findUnique({ where: { slug: decoded } });
  } catch (err) {
    console.error("[article] DB unreachable:", err instanceof Error ? err.message : err);
  }

  if (!article) notFound();

  return (
    <div className="min-h-screen bg-sand-50">
      {article.imageUrl && (
        <div className="mx-auto max-w-5xl px-5 pt-6">
          <img
            src={article.imageUrl}
            alt={article.title}
            className="h-64 w-full rounded-3xl object-cover shadow-sm sm:h-80 md:h-96"
          />
        </div>
      )}

      <article className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-bold leading-snug tracking-tight text-sage-900 sm:text-4xl">
          {article.title}
        </h1>

        {article.content && (
          <div
            className="prose-article mt-8 text-right text-[15px] leading-[2] text-sage-700"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        )}

        <div className="mt-16 rounded-[2rem] bg-gradient-to-bl from-sage-600 to-sage-700 p-8 text-center text-white sm:p-10">
          <p className="text-xl font-bold sm:text-2xl">אהבתם את הכתבה? בואו לתרגל איתי</p>
          <p className="mx-auto mt-3 max-w-md text-sm text-sage-200 leading-relaxed">
            המקום הכי טוב להמשיך את המסע הוא על המזרן.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schedule"
              className="inline-flex items-center gap-2 rounded-3xl bg-white px-6 py-3 text-sm font-semibold text-sage-700 shadow-lg transition-all hover:bg-sage-50 active:scale-[0.97]"
            >
              צפייה במערכת השעות
            </Link>
            <Link
              href="/articles"
              className="inline-flex items-center gap-2 rounded-3xl border border-white/30 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/10"
            >
              <ArrowRight className="h-4 w-4" />
              חזרה לכל הכתבות
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
