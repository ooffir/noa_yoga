import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Singleton Prisma client with automatic retry on transient connection errors.
 *
 * Configuration notes for the Supabase connection string:
 *
 *   DATABASE_URL  — runtime queries. MUST use the pooler port 6543 with
 *                   `?pgbouncer=true&connection_limit=1&pool_timeout=30`.
 *                   Without those params, Vercel functions exhaust
 *                   PgBouncer's prepared-statement cache and start
 *                   throwing "PrismaClientInitializationError: Can't
 *                   reach database server" on cold-start spikes.
 *
 *   DIRECT_URL    — used by `prisma migrate` / `prisma db push` only.
 *                   MUST use port 5432 (direct, no pooler) and NO query
 *                   params. Setting pgbouncer=true here breaks DDL.
 *
 * Recommended values (copy verbatim into Vercel env vars):
 *
 *   DATABASE_URL="postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=30"
 *   DIRECT_URL="postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres"
 *
 * Why retry middleware exists:
 *
 *   Supabase's PgBouncer drops idle connections after a short timeout.
 *   Vercel keeps Lambda functions warm for several minutes between
 *   invocations and reuses the same Prisma client. When a request hits
 *   a warm Lambda whose connection was silently dropped by the pooler,
 *   the first query fails with P1001 / P1017 / P2024. The retry layer
 *   below transparently re-issues the query, which reconnects through
 *   PgBouncer and succeeds. End users never see the blip.
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof buildPrismaClient>;
};

// Postgres / Prisma error codes worth retrying. These are all transient
// (network / pool / connection) errors that succeed on a fresh connection.
const RETRYABLE_PRISMA_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server connection timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a connection from the pool
]);

// Engine-level errors that don't carry a code but match a known message
// pattern. Kept conservative on purpose — adding too many here would
// cause real bugs to be silently retried 3x.
const RETRYABLE_MESSAGE_PATTERNS = [
  /can't reach database server/i,
  /connection.*closed/i,
  /connection terminated/i,
  /server has gone away/i,
  /connection refused/i,
  /econnreset/i,
  /etimedout/i,
];

function isRetryableError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_PRISMA_CODES.has(err.code);
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return false;
  }
  if (err instanceof Error) {
    return RETRYABLE_MESSAGE_PATTERNS.some((p) => p.test(err.message));
  }
  return false;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// Three attempts with 100ms / 400ms backoff. Total worst-case latency
// added: ~500ms — well within Vercel's 10s function timeout.
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFFS_MS = [100, 400];

function buildPrismaClient() {
  const url = process.env.DATABASE_URL;

  // Defensive: log a clear error on cold-start if the URL is missing.
  if (!url || !url.trim()) {
    console.error(
      "[prisma] DATABASE_URL is not set. The app will fail on every DB query. " +
        "Set DATABASE_URL on Vercel → Project Settings → Environment Variables.",
    );
  } else if (!/[?&]pgbouncer=true/.test(url) && /:6543\//.test(url)) {
    console.warn(
      "[prisma] DATABASE_URL uses pooler port 6543 but is missing " +
        "`?pgbouncer=true&connection_limit=1&pool_timeout=30`. Connection failures are likely.",
    );
  }

  const base = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
    datasources: { db: { url } },
  });

  // Wrap every operation with retry logic. This catches the textbook
  // "stale pooler connection" failure that happens when a warm Lambda's
  // cached connection has been silently dropped by PgBouncer.
  return base.$extends({
    name: "retry-on-transient-errors",
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation }) {
          let lastErr: unknown;
          for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
            try {
              return await query(args);
            } catch (err) {
              lastErr = err;
              if (attempt === RETRY_ATTEMPTS || !isRetryableError(err)) {
                throw err;
              }
              const backoff = RETRY_BACKOFFS_MS[attempt - 1] ?? 400;
              console.warn(
                `[prisma:retry] ${model}.${operation} failed (attempt ${attempt}/${RETRY_ATTEMPTS}), ` +
                  `retrying in ${backoff}ms. Cause:`,
                err instanceof Error ? err.message : err,
              );
              await delay(backoff);
            }
          }
          // Unreachable — the loop either returns or throws — but keeps TS happy.
          throw lastErr;
        },
      },
    },
  });
}

export const prisma = globalForPrisma.prisma || buildPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
