import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "omer609994@gmail.com";

type SessionClaimsMap = Record<string, unknown> | null | undefined;

function getStringClaim(claims: SessionClaimsMap, key: string) {
  const value = claims?.[key];
  return typeof value === "string" ? value : undefined;
}

const getSharedIdentity = cache(async () => {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const claims = sessionClaims as SessionClaimsMap;
  let email = getStringClaim(claims, "email");
  let firstName = getStringClaim(claims, "first_name");
  let lastName = getStringClaim(claims, "last_name");
  let image = getStringClaim(claims, "image_url");

  if (!email) {
    let clerkUser = null;
    try {
      clerkUser = await currentUser();
    } catch {
      return null;
    }

    if (!clerkUser?.emailAddresses?.[0]) return null;
    email = clerkUser.emailAddresses[0].emailAddress;
    firstName = clerkUser.firstName || firstName;
    lastName = clerkUser.lastName || lastName;
    image = clerkUser.imageUrl || image;
  }

  return {
    userId,
    email,
    name: [firstName, lastName].filter(Boolean).join(" ") || null,
    image: image || null,
  };
});

/**
 * Per-request cached lookup — resolves Clerk session to a DB user.
 * Uses findUnique (fast read) instead of upsert (slow write).
 * Only creates the user if they genuinely don't exist yet.
 * Wrapped in React.cache() so duplicate calls within one request are free.
 */
export const getSharedUser = cache(async () => {
  const identity = await getSharedIdentity();
  if (!identity?.email) return null;

  let dbUser = await prisma.user.findUnique({ where: { email: identity.email } });

  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name,
        image: identity.image,
        role: identity.email === ADMIN_EMAIL ? "ADMIN" : "STUDENT",
        hasSignedHealthDeclaration: false,
      },
    });
  }

  return dbUser;
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

/**
 * Full sync — only call from the Clerk webhook or explicit profile update.
 */
export async function syncUser() {
  const identity = await getSharedIdentity();
  if (!identity?.email) {
    return null;
  }

  return prisma.user.upsert({
    where: { email: identity.email },
    update: {
      name: identity.name,
      image: identity.image,
    },
    create: {
      email: identity.email,
      name: identity.name,
      image: identity.image,
      role: identity.email === ADMIN_EMAIL ? "ADMIN" : "STUDENT",
      hasSignedHealthDeclaration: false,
    },
  });
}
