import { Prisma } from "@prisma/client";

/**
 * Helpers for classifying DB-side failures into user-friendly Hebrew
 * responses.
 *
 * The Prisma client wrapper in `src/lib/prisma.ts` already retries
 * transient connection errors automatically (P1001, P1017, P2024,
 * etc.) up to 3x with exponential backoff. By the time an error
 * surfaces here, the retries have already failed — so the response
 * message should tell the admin "the database is unreachable, try
 * again" rather than the generic "operation failed".
 */

const TRANSIENT_PRISMA_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server connection timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a connection from the pool
]);

const TRANSIENT_PATTERNS = [
  /can't reach database server/i,
  /connection.*closed/i,
  /connection terminated/i,
  /connection refused/i,
  /econnreset/i,
  /etimedout/i,
];

export function isTransientDbError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_PRISMA_CODES.has(err.code);
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (err instanceof Error) {
    return TRANSIENT_PATTERNS.some((p) => p.test(err.message));
  }
  return false;
}

/**
 * Classifies an error into a Hebrew user-facing message and an
 * appropriate HTTP status code. Use in API route catch blocks so the
 * admin sees a precise reason instead of generic "פעולה נכשלה".
 */
export function dbErrorResponse(
  err: unknown,
  fallbackMessage: string,
): { message: string; status: number } {
  if (isTransientDbError(err)) {
    return {
      message:
        "שרת המידע לא זמין כרגע. ניסינו לחבר מחדש מספר פעמים ולא הצלחנו. " +
        "נסי שוב בעוד מספר שניות.",
      status: 503,
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return { message: "כבר קיים פריט עם הערכים האלה.", status: 409 };
    }
    if (err.code === "P2025") {
      return { message: "הפריט לא נמצא או נמחק.", status: 404 };
    }
    if (err.code === "P2021") {
      // Schema mismatch — DB out of sync with Prisma client. This is
      // a deployment bug that requires running `prisma db push`.
      return {
        message:
          "הטבלה לא קיימת במסד הנתונים. ייתכן שהמיגרציה לא רצה. " +
          "פני לתמיכה הטכנית.",
        status: 500,
      };
    }
  }

  return { message: fallbackMessage, status: 500 };
}
