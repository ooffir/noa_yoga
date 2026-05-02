import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client.
 *
 * Configuration notes for the Supabase connection string:
 *
 *   DATABASE_URL  — runtime queries. MUST use the pooler port 6543 with
 *                   `?pgbouncer=true&connection_limit=10&pool_timeout=30`.
 *                   Without those params, Vercel functions exhaust
 *                   PgBouncer's prepared-statement cache and start
 *                   throwing "PrismaClientInitializationError: Can't
 *                   reach database server" on cold-start spikes.
 *
 *   DIRECT_URL    — used by `prisma migrate` / `prisma db push` only.
 *                   MUST use port 5432 (direct, no pooler) and NO query
 *                   params. Setting pgbouncer=true here breaks DDL.
 *
 * Example of correct values (copy verbatim into Vercel env vars):
 *
 *   DATABASE_URL="postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10&pool_timeout=30"
 *   DIRECT_URL="postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres"
 *
 * If the production logs are showing PrismaClientInitializationError,
 * 99% of the time it's because the env vars on Vercel are missing the
 * `?pgbouncer=true&connection_limit=10` part on DATABASE_URL.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;

  // Defensive: log a clear error on cold-start if the URL is missing.
  // Without this, Prisma throws an opaque "data source URL not provided"
  // that's easy to confuse with the connection-refused error.
  if (!url || !url.trim()) {
    console.error(
      "[prisma] DATABASE_URL is not set. The app will fail on every DB query. " +
        "Set DATABASE_URL on Vercel → Project Settings → Environment Variables.",
    );
  } else if (!/[?&]pgbouncer=true/.test(url) && /:6543\//.test(url)) {
    // Pooler port 6543 without pgbouncer=true is a classic misconfig
    // that causes intermittent cold-start failures. Warn loudly.
    console.warn(
      "[prisma] DATABASE_URL uses pooler port 6543 but is missing " +
        "`?pgbouncer=true&connection_limit=10`. Connection failures are likely.",
    );
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: {
      db: { url },
    },
  });
}

export const prisma = globalForPrisma.prisma || buildPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
