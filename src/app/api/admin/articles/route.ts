import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

function toSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) + "-" + Date.now().toString(36);
}

export async function GET() {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const articles = await db.article.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(articles);
  } catch {
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, content, imageUrl } = await req.json();

    if (!title || !content || !imageUrl) {
      return NextResponse.json({ error: "כל השדות נדרשים" }, { status: 400 });
    }

    const slug = toSlug(title);

    const article = await db.article.create({
      data: { title, slug, content, imageUrl },
    });

    revalidatePath("/articles");
    return NextResponse.json(article, { status: 201 });
  } catch {
    return NextResponse.json({ error: "יצירת כתבה נכשלה" }, { status: 500 });
  }
}
