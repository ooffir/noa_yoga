import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let event: any;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const { email_addresses, first_name, last_name, image_url } = event.data;
    const email = email_addresses?.[0]?.email_address;
    if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

    const name = [first_name, last_name].filter(Boolean).join(" ") || null;
    const isAdmin = isAdminEmail(email);

    await prisma.user.upsert({
      where: { email },
      update: { name, image: image_url, ...(isAdmin ? { role: "ADMIN" as const } : {}) },
      create: {
        email,
        name,
        image: image_url,
        role: isAdmin ? "ADMIN" : "STUDENT",
        hasSignedHealthDeclaration: false,
      },
    });
  }

  return NextResponse.json({ received: true });
}
