import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";
import { fetchAnalytics } from "@/lib/analytics";

/**
 * GET /api/admin/analytics?start=YYYY-MM-DD&end=YYYY-MM-DD&classTitle=...
 *
 * Returns the entire dashboard payload in one round-trip — all five
 * aggregations run in parallel via `Promise.all`. Every aggregation is
 * evaluated in PostgreSQL (not Node) so the endpoint remains fast as
 * the DB grows.
 *
 * Auth: explicit getDbUser() check — same pattern as /api/admin/dashboard.
 *
 *   • 401 = no Clerk session (the user isn't signed in OR the session
 *           cookie didn't reach this route).
 *   • 403 = signed in but role !== ADMIN.
 *
 * We deliberately do NOT use `requireAdmin()` from auth-helpers here
 * because that helper calls `redirect()`, which is meant for server
 * components / pages — in API routes it throws a synthetic redirect
 * error that gets swallowed by a catch-all and surfaces as a confusing
 * generic 401. The explicit check below returns precise status codes
 * AND logs the reason, so future auth issues are easy to diagnose.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  // ── Auth check ──
  let dbUser;
  try {
    dbUser = await getDbUser();
  } catch (err) {
    console.error("[analytics] getDbUser threw:", err);
    return NextResponse.json(
      { error: "auth resolution failed" },
      { status: 500 },
    );
  }

  if (!dbUser) {
    console.error(
      "[analytics] no Clerk session — request had no auth context",
    );
    return NextResponse.json(
      { error: "unauthorized — please sign in" },
      { status: 401 },
    );
  }

  if (dbUser.role !== "ADMIN") {
    console.error("[analytics] user is not admin", {
      userId: dbUser.id,
      role: dbUser.role,
    });
    return NextResponse.json(
      { error: "forbidden — admin role required" },
      { status: 403 },
    );
  }

  // ── Parameter parsing ──
  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const classTitle = searchParams.get("classTitle")?.trim() || null;

  const endDate = endParam ? new Date(endParam) : new Date();
  const startDate = startParam
    ? new Date(startParam)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default: last 30 days

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json(
      { error: "invalid start/end date" },
      { status: 400 },
    );
  }
  if (startDate > endDate) {
    return NextResponse.json(
      { error: "start must be before end" },
      { status: 400 },
    );
  }

  // ── Aggregations ──
  try {
    const payload = await fetchAnalytics({
      startDate,
      endDate,
      classTitle,
    });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[analytics] fetch failed:", err);
    return NextResponse.json(
      {
        error: "analytics query failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
