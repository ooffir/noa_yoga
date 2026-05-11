import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(time: string): string {
  return time;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatCurrency(amount: number, currency = "ILS"): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

export function toUTCDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Israel timezone helpers (DST-aware, no external dependency)
//
//  Storage convention in this codebase:
//    - `ClassInstance.date`       — Date stored as UTC midnight of the
//                                   calendar day the class falls on (in
//                                   Israel's calendar).
//    - `ClassInstance.startTime`  — "HH:MM" wall-clock time in Asia/Jerusalem.
//
//  The bug being fixed: previously we did `new Date(date).setHours(HH, MM)`,
//  which operates in the SERVER's local timezone. On Vercel (UTC), 18:00
//  Israel time was being interpreted as 18:00 UTC → 21:00 Israel. Past
//  classes stayed "active" for 2-3h after they ended, refunds got the
//  wrong window, and the upcoming/history split misclassified everything.
//
//  This helper computes the correct UTC timestamp of a class's start
//  moment by dynamically determining the Israel UTC offset (handles
//  Israel's IST↔IDT DST switches automatically via Intl.DateTimeFormat).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the UTC millisecond timestamp of when the class actually starts.
 *
 * @param date      — class's calendar day (stored UTC-midnight per convention)
 * @param startTime — wall-clock "HH:MM" string in Asia/Jerusalem
 * @returns         — UTC ms since epoch, comparable to `Date.now()`
 */
export function israelClassStartUtcMs(date: Date, startTime: string): number {
  // 1. Get the YYYY-MM-DD that `date` falls on **in Israel** (handles the
  //    edge case where UTC midnight is still the previous day locally).
  //    "en-CA" locale formats as "YYYY-MM-DD".
  const dateInIsrael = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [y, mo, d] = dateInIsrael.split("-").map(Number);

  // 2. Determine Israel's UTC offset for this specific date. Probe noon
  //    UTC (which is always 14:00 IST or 15:00 IDT — safely clear of
  //    DST transitions at 02:00 local). The hour-of-day returned by Intl
  //    minus 12 gives the offset.
  const probeUtcMs = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const israelHourAtNoonUtc = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(probeUtcMs)),
  );
  const offsetHours = israelHourAtNoonUtc - 12; // 2 (IST winter) or 3 (IDT summer)

  // 3. Convert wall-clock start time to UTC timestamp.
  //    e.g. "18:00" in summer → Date.UTC(y, mo-1, d, 18 - 3, 0) = 15:00 UTC
  const [wallHh, wallMm] = startTime.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, wallHh - offsetHours, wallMm, 0, 0);
}

/**
 * Has this class's start time passed (in Asia/Jerusalem)?
 *
 * Use this anywhere you need to gate behaviour on "is the class over":
 * UI mute-state, register button visibility, "you can't book a past class"
 * server-side validation, etc.
 */
export function isClassPast(date: Date, startTime: string): boolean {
  return israelClassStartUtcMs(date, startTime) < Date.now();
}

export function isWithinCancellationWindow(
  classDate: Date,
  classTime: string,
  hoursBeforeThreshold: number = 6
): boolean {
  const classStartMs = israelClassStartUtcMs(classDate, classTime);
  const diffHours = (classStartMs - Date.now()) / (1000 * 60 * 60);
  return diffHours >= hoursBeforeThreshold;
}
