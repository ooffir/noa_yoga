import type { MetadataRoute } from "next";

/**
 * /robots.txt — tells search engines what to crawl and what to skip.
 *
 * We allow everything public (homepage, schedule, pricing, articles,
 * workshops, auth pages) and explicitly disallow:
 *   - /admin/*      — staff-only dashboards & stats, never meant for public
 *   - /profile/*    — per-user data (credits, booking history)
 *   - /payments/*   — post-checkout return pages (tied to a specific
 *                    Payment id that Google has no business indexing)
 *   - /api/*        — JSON endpoints, not rendered HTML
 *
 * The sitemap points crawlers at the public routes explicitly so
 * discoverability doesn't depend on internal link structure.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://noa-yoga.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/profile/", "/payments/", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
