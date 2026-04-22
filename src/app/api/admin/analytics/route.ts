import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { fetchAnalytics } from "@/lib/analytics";

/**
 * GET /api/admin/analytics?start=YYYY-MM-DD&end=YYYY-MM-DD&classTitle=...
 *
 * Returns the entire dashboard payload in one round-trip — all five
 * aggregations run in parallel via `Promise.all`. Every aggregation is
 * evaluated in PostgreSQL (not Node) so the endpoint remains fast as
 * the DB grows.
 *
 * Auth: requireAdmin() — 401 for non-admins.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
