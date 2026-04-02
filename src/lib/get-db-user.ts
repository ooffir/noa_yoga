import { getSharedUser } from "@/lib/auth-helpers";

export async function getDbUser() {
  return getSharedUser();
}

export async function requireDbUser() {
  const user = await getDbUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
