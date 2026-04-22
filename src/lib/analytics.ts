import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Analytics aggregation layer.
 *
 * Every function below runs its aggregation INSIDE PostgreSQL using either
 * Prisma's `groupBy` or `$queryRaw`. No approach fetches full row sets and
 * aggregates in Node — so the site stays fast as the DB grows.
 *
 * Conditional SQL fragments use `Prisma.sql` / `Prisma.empty` so the
 * `classTitle` filter can be composed safely (parameterized, no injection).
 *
 * All prices come out of the DB in agurot (ILS cents). The helpers convert
 * to ILS (2-decimal) for display, and return raw agurot for re-use.
 */

export interface AnalyticsFilters {
  startDate: Date;
  endDate: Date;
  classTitle?: string | null; // e.g., "Vinyasa" — null/undefined = all classes
}

function classTitleFragment(classTitle?: string | null) {
  return classTitle
    ? Prisma.sql`AND cd.title = ${classTitle}`
    : Prisma.empty;
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. Demand per weekday × time slot (cumulative bookings + fill rate)
// ─────────────────────────────────────────────────────────────────────────────

export interface DemandRow {
  dow: number; // 0 = Sunday .. 6 = Saturday (Postgres convention)
  startTime: string; // "HH:MM"
  title: string;
  bookings: number;
  totalCapacity: number;
  instances: number;
  fillRate: number; // 0..1
}

export async function demandByWeekdayAndTime(
  filters: AnalyticsFilters,
): Promise<DemandRow[]> {
  const { startDate, endDate, classTitle } = filters;

  // per-instance subquery → capacity summed honestly across heterogeneous
  // classes (instead of SUM(DISTINCT) which silently truncates duplicates).
  const rows = await prisma.$queryRaw<
    Array<{
      dow: number;
      start_time: string;
      title: string;
      bookings: bigint;
      total_capacity: bigint;
      instances: bigint;
    }>
  >(Prisma.sql`
    SELECT
      EXTRACT(DOW FROM t.date)::int as dow,
      t.start_time,
      t.title,
      SUM(t.booking_count)::bigint as bookings,
      SUM(t.max_capacity)::bigint as total_capacity,
      COUNT(*)::bigint as instances
    FROM (
      SELECT
        ci.id,
        ci.date,
        ci.start_time,
        ci.max_capacity,
        cd.title,
        COUNT(b.id) FILTER (WHERE b.status = 'CONFIRMED')::int as booking_count
      FROM class_instances ci
      LEFT JOIN bookings b ON b.class_instance_id = ci.id
      JOIN class_definitions cd ON cd.id = ci.class_def_id
      WHERE ci.date BETWEEN ${startDate} AND ${endDate}
        AND ci.is_cancelled = false
        ${classTitleFragment(classTitle)}
      GROUP BY ci.id, ci.date, ci.start_time, ci.max_capacity, cd.title
    ) t
    GROUP BY dow, t.start_time, t.title
    ORDER BY dow, t.start_time
  `);

  return rows.map((r) => {
    const bookings = Number(r.bookings);
    const capacity = Number(r.total_capacity);
    return {
      dow: Number(r.dow),
      startTime: r.start_time,
      title: r.title,
      bookings,
      totalCapacity: capacity,
      instances: Number(r.instances),
      fillRate: capacity > 0 ? bookings / capacity : 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. Revenue over time (weekly) — payments + workshops merged
// ─────────────────────────────────────────────────────────────────────────────

export interface RevenueRow {
  weekStart: string; // YYYY-MM-DD
  paymentsAgurot: number;
  workshopsAgurot: number;
  totalIls: number;
}

export async function weeklyRevenue(
  filters: AnalyticsFilters,
): Promise<RevenueRow[]> {
  const { startDate, endDate } = filters;

  const [paymentsRows, workshopsRows] = await Promise.all([
    prisma.$queryRaw<Array<{ week_start: Date; total_agurot: bigint }>>(Prisma.sql`
      SELECT
        DATE_TRUNC('week', created_at)::date as week_start,
        COALESCE(SUM(amount), 0)::bigint as total_agurot
      FROM payments
      WHERE status = 'COMPLETED'
        AND created_at BETWEEN ${startDate} AND ${endDate}
      GROUP BY week_start
      ORDER BY week_start
    `),
    prisma.$queryRaw<Array<{ week_start: Date; total_agurot: bigint }>>(Prisma.sql`
      SELECT
        DATE_TRUNC('week', wr.created_at)::date as week_start,
        COALESCE(SUM(w.price * 100), 0)::bigint as total_agurot
      FROM workshop_registrations wr
      JOIN workshops w ON w.id = wr.workshop_id
      WHERE wr.payment_status = 'COMPLETED'
        AND wr.created_at BETWEEN ${startDate} AND ${endDate}
      GROUP BY week_start
      ORDER BY week_start
    `),
  ]);

  const map = new Map<
    string,
    { paymentsAgurot: number; workshopsAgurot: number }
  >();
  for (const r of paymentsRows) {
    const k = r.week_start.toISOString().slice(0, 10);
    const existing = map.get(k) || { paymentsAgurot: 0, workshopsAgurot: 0 };
    existing.paymentsAgurot = Number(r.total_agurot);
    map.set(k, existing);
  }
  for (const r of workshopsRows) {
    const k = r.week_start.toISOString().slice(0, 10);
    const existing = map.get(k) || { paymentsAgurot: 0, workshopsAgurot: 0 };
    existing.workshopsAgurot = Number(r.total_agurot);
    map.set(k, existing);
  }

  return [...map.entries()]
    .map(([weekStart, v]) => ({
      weekStart,
      paymentsAgurot: v.paymentsAgurot,
      workshopsAgurot: v.workshopsAgurot,
      totalIls: (v.paymentsAgurot + v.workshopsAgurot) / 100,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. Student engagement — total bookings + most-active hour per user
// ─────────────────────────────────────────────────────────────────────────────

export interface StudentEngagementRow {
  userId: string;
  name: string | null;
  email: string;
  totalBookings: number;
  mostActiveTime: string | null; // "HH:MM"
}

export async function studentEngagement(
  filters: AnalyticsFilters,
  limit: number = 50,
): Promise<StudentEngagementRow[]> {
  const { startDate, endDate, classTitle } = filters;

  const rows = await prisma.$queryRaw<
    Array<{
      user_id: string;
      name: string | null;
      email: string;
      total_bookings: bigint;
      most_active_time: string | null;
    }>
  >(Prisma.sql`
    WITH per_slot AS (
      SELECT
        b.user_id,
        ci.start_time,
        COUNT(*)::bigint as slot_count
      FROM bookings b
      JOIN class_instances ci ON ci.id = b.class_instance_id
      JOIN class_definitions cd ON cd.id = ci.class_def_id
      WHERE b.status = 'CONFIRMED'
        AND ci.date BETWEEN ${startDate} AND ${endDate}
        ${classTitleFragment(classTitle)}
      GROUP BY b.user_id, ci.start_time
    ),
    totals AS (
      SELECT user_id, SUM(slot_count)::bigint as total_bookings
      FROM per_slot GROUP BY user_id
    ),
    top_slot AS (
      SELECT DISTINCT ON (user_id)
        user_id, start_time
      FROM per_slot
      ORDER BY user_id, slot_count DESC, start_time ASC
    )
    SELECT
      u.id as user_id,
      u.name,
      u.email,
      t.total_bookings,
      ts.start_time as most_active_time
    FROM totals t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN top_slot ts ON ts.user_id = t.user_id
    ORDER BY t.total_bookings DESC, u.name ASC NULLS LAST
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    totalBookings: Number(r.total_bookings),
    mostActiveTime: r.most_active_time,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. Utilization rate — single aggregate over the date range
// ─────────────────────────────────────────────────────────────────────────────

export interface UtilizationResult {
  totalBookings: number;
  totalCapacity: number;
  rate: number; // 0..1
}

export async function utilizationRate(
  filters: AnalyticsFilters,
): Promise<UtilizationResult> {
  const { startDate, endDate, classTitle } = filters;

  const rows = await prisma.$queryRaw<
    Array<{ total_bookings: bigint; total_capacity: bigint }>
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(booking_count), 0)::bigint as total_bookings,
      COALESCE(SUM(max_capacity), 0)::bigint as total_capacity
    FROM (
      SELECT
        ci.max_capacity,
        COUNT(b.id) FILTER (WHERE b.status = 'CONFIRMED')::int as booking_count
      FROM class_instances ci
      LEFT JOIN bookings b ON b.class_instance_id = ci.id
      JOIN class_definitions cd ON cd.id = ci.class_def_id
      WHERE ci.date BETWEEN ${startDate} AND ${endDate}
        AND ci.is_cancelled = false
        ${classTitleFragment(classTitle)}
      GROUP BY ci.id
    ) t
  `);

  const row = rows[0];
  const totalBookings = Number(row?.total_bookings ?? 0);
  const totalCapacity = Number(row?.total_capacity ?? 0);
  return {
    totalBookings,
    totalCapacity,
    rate: totalCapacity > 0 ? totalBookings / totalCapacity : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. Distinct class titles for the filter dropdown
// ─────────────────────────────────────────────────────────────────────────────

export async function distinctClassTitles(): Promise<string[]> {
  const rows = await prisma.classDefinition.findMany({
    where: { isActive: true },
    distinct: ["title"],
    select: { title: true },
    orderBy: { title: "asc" },
  });
  return rows.map((r) => r.title);
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. Single composite fetch — parallel Promise.all for a one-round-trip API
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalyticsPayload {
  filters: { startDate: string; endDate: string; classTitle: string | null };
  demand: DemandRow[];
  revenue: RevenueRow[];
  students: StudentEngagementRow[];
  utilization: UtilizationResult;
  classTitles: string[];
}

export async function fetchAnalytics(
  filters: AnalyticsFilters,
): Promise<AnalyticsPayload> {
  const [demand, revenue, students, utilization, classTitles] =
    await Promise.all([
      demandByWeekdayAndTime(filters),
      weeklyRevenue(filters),
      studentEngagement(filters, 50),
      utilizationRate(filters),
      distinctClassTitles(),
    ]);

  return {
    filters: {
      startDate: filters.startDate.toISOString(),
      endDate: filters.endDate.toISOString(),
      classTitle: filters.classTitle ?? null,
    },
    demand,
    revenue,
    students,
    utilization,
    classTitles,
  };
}
