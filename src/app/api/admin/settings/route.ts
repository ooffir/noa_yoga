import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

async function getOrCreate() {
  let settings = await db.siteSettings.findUnique({ where: { id: "main" } });
  if (!settings) {
    settings = await db.siteSettings.create({ data: { id: "main" } });
  }
  return settings;
}

export async function GET() {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const settings = await getOrCreate();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { aboutTitle, aboutSubtitle, aboutContent, profileImageUrl } = await req.json();

    await getOrCreate();

    const settings = await db.siteSettings.update({
      where: { id: "main" },
      data: {
        aboutTitle: aboutTitle || "נעים להכיר",
        aboutSubtitle: aboutSubtitle || "",
        aboutContent: aboutContent || "",
        profileImageUrl: profileImageUrl || null,
      },
    });

    revalidatePath("/");
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "שמירה נכשלה" }, { status: 500 });
  }
}
