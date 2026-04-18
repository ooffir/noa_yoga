import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";

const TRACE = process.env.NODE_ENV === "development";

/**
 * Per-request cached user resolver.
 *
 * Performance strategy:
 *   1. auth() — instant, reads JWT from cookie, no network call
 *   2. prisma.user.findUnique({ clerkId }) — single indexed DB read
 *   3. currentUser() — ONLY called on first-ever sign-in when no DB row exists
 */
export const getSharedUser = cache(async () => {
  if (TRACE) console.time("auth:total");
  try {
    if (TRACE) console.time("auth:auth()");
    const { userId: clerkId } = await auth();
    if (TRACE) console.timeEnd("auth:auth()");
    if (!clerkId) return null;

    if (TRACE) console.time("auth:db.findByClerkId");
    let dbUser = await prisma.user.findUnique({ where: { clerkId } });
    if (TRACE) console.timeEnd("auth:db.findByClerkId");

    if (dbUser) return dbUser;

    if (TRACE) console.time("auth:currentUser()");
    let clerkUser = null;
    try {
      clerkUser = await currentUser();
    } catch {
      if (TRACE) console.timeEnd("auth:currentUser()");
      return null;
    }
    if (TRACE) console.timeEnd("auth:currentUser()");
    if (!clerkUser?.emailAddresses?.[0]) return null;

    const email = clerkUser.emailAddresses[0].emailAddress;
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
    const image = clerkUser.imageUrl || null;

    dbUser = await prisma.user.findUnique({ where: { email } });

    if (dbUser) {
      dbUser = await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          clerkId,
          name,
          image,
          ...(isAdminEmail(email) && dbUser.role !== "ADMIN" ? { role: "ADMIN" as const } : {}),
        },
      });
      return dbUser;
    }

    dbUser = await prisma.user.create({
      data: {
        clerkId,
        email,
        name,
        image,
        role: isAdminEmail(email) ? "ADMIN" : "STUDENT",
        hasSignedHealthDeclaration: false,
      },
    });

    return dbUser;
  } finally {
    if (TRACE) console.timeEnd("auth:total");
  }
});

export const getSessionUser = getSharedUser;

export async function requireAuth() {
  const dbUser = await getSharedUser();
  if (!dbUser) redirect("/sign-in");
  return dbUser;
}

export async function requireAdmin() {
  const dbUser = await requireAuth();
  if (dbUser.role !== "ADMIN") redirect("/");
  return dbUser;
}

export async function getCurrentUser() {
  return getSharedUser();
}

export async function syncUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  let clerkUser = null;
  try {
    clerkUser = await currentUser();
  } catch {
    return null;
  }
  if (!clerkUser?.emailAddresses?.[0]) return null;

  const email = clerkUser.emailAddresses[0].emailAddress;
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
  const image = clerkUser.imageUrl || null;

  return prisma.user.upsert({
    where: { email },
    update: {
      clerkId,
      name,
      image,
      ...(isAdminEmail(email) ? { role: "ADMIN" as const } : {}),
    },
    create: {
      clerkId,
      email,
      name,
      image,
      role: isAdminEmail(email) ? "ADMIN" : "STUDENT",
      hasSignedHealthDeclaration: false,
    },
  });
}
