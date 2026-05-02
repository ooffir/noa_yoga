import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health
 *
 * Liveness + readiness probe. Returns:
 *   - 200 with { ok: true, db: "connected", latencyMs: N } when healthy
 *   - 503 with { ok: false, db: "unreachable", error } when DB unreachable
 *
 * Use cases:
 *   - Vercel/UptimeRobot/Better Stack ping this URL to alert on outages
 *   - Quick manual check after env-var changes:
 *       curl https://noa-yoga.vercel.app/api/health
 *   - The admin can paste this URL to Noa's PayMe/Supabase support if
 *     they need to prove the app is running but DB is the bottleneck.
 *
 * Performance: a single SELECT 1 on the pooler. ~50ms when healthy.
 * Does not require auth — must be reachable when the app is degraded.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const t0 = Date.now();
  try {
    // Smallest possible query — exercises the connection pool without
    // touching any tables. If this throws, every other DB call would too.
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - t0;
    return NextResponse.json(
      {
        ok: true,
        db: "connected",
        latencyMs,
        env: {
          hasDatabaseUrl: !!process.env.DATABASE_URL,
          hasDirectUrl: !!process.env.DIRECT_URL,
          nodeEnv: process.env.NODE_ENV,
        },
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache",
        },
      },
    );
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[health] DB unreachable:", message);

    return NextResponse.json(
      {
        ok: false,
        db: "unreachable",
        latencyMs,
        error: message.slice(0, 400),
        env: {
          hasDatabaseUrl: !!process.env.DATABASE_URL,
          hasDirectUrl: !!process.env.DIRECT_URL,
          nodeEnv: process.env.NODE_ENV,
        },
        timestamp: new Date().toISOString(),
        // Hint at the most common fix so a non-engineer can act on the
        // response body alone.
        hint:
          "If this persists for >1min: (a) check Supabase project isn't paused, " +
          "(b) verify DATABASE_URL on Vercel uses port 6543 with " +
          "?pgbouncer=true&connection_limit=10, (c) verify password didn't rotate.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache",
        },
      },
    );
  }
}
