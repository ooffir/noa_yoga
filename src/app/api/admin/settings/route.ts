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

    const body = await req.json();

    await getOrCreate();

    const settings = await db.siteSettings.update({
      where: { id: "main" },
      data: {
        heroTitle: body.heroTitle ?? "",
        heroSubtitle: body.heroSubtitle ?? "",
        cardsHeading: body.cardsHeading ?? "למה לתרגל איתנו",
        cardsSubheading: body.cardsSubheading ?? "",
        aboutTitle: body.aboutTitle || "נעים להכיר",
        aboutSubtitle: body.aboutSubtitle || "",
        aboutContent: body.aboutContent || "",
        profileImageUrl: body.profileImageUrl || null,
        creditPrice: body.creditPrice != null ? Number(body.creditPrice) : 50,
        punchCard5Price:
          body.punchCard5Price != null ? Number(body.punchCard5Price) : 200,
        punchCardPrice: body.punchCardPrice != null ? Number(body.punchCardPrice) : 350,
        cancellationWindow:
          body.cancellationWindow != null
            ? Math.max(0, Number(body.cancellationWindow))
            : 6,
      },
    });

    revalidatePath("/");
    revalidatePath("/pricing");
    revalidatePath("/schedule");
    revalidatePath("/profile");
    revalidatePath("/admin/settings");
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "שמירה נכשלה" }, { status: 500 });
  }
}
