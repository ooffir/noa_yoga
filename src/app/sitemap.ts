import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

/**
 * Dynamic sitemap — Next.js App Router convention.
 *
 * Next reads this file at /sitemap.xml automatically. The output is an
 * array of entry objects; Next serializes them to the correct XML format.
 *
 * Strategy:
 *   - Static public routes with recent `lastModified` so Google recrawls
 *     promptly after a content update.
 *   - Dynamic article slugs from the `articles` table (blog / magazine).
 *   - Dynamic workshop slugs from `workshops` (we use `id` since
 *     workshops don't have a slug column — routes are `/workshops?...`
 *     in the current app, but we emit `/workshops` as a single entry).
 *   - Admin and profile routes are excluded — robots.ts disallows them.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://noa-yoga.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/schedule`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/articles`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/workshops`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/sign-in`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/sign-up`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];

  let articleRoutes: MetadataRoute.Sitemap = [];
  let workshopIsActive = false;

  try {
    const [articles, activeWorkshops] = await Promise.all([
      prisma.article.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      prisma.workshop.count({
        where: { isActive: true, date: { gte: now } },
      }),
    ]);

    articleRoutes = articles
      .filter((a) => a.slug)
      .map((a) => ({
        url: `${SITE_URL}/articles/${encodeURIComponent(a.slug)}`,
        lastModified: a.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));

    workshopIsActive = activeWorkshops > 0;
  } catch (err) {
    // DB unreachable at build time — return the static portion only.
    // Google will still discover dynamic pages via internal links.
    console.error("[sitemap] DB error, returning static routes only:", err);
  }

  // Bump `/workshops` frequency if there are active upcoming workshops.
  if (workshopIsActive) {
    const ws = staticRoutes.find((r) => r.url.endsWith("/workshops"));
    if (ws) ws.changeFrequency = "daily";
  }

  return [...staticRoutes, ...articleRoutes];
}
