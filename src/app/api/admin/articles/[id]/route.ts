import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { title, content, imageUrl } = await req.json();

    const article = await db.article.update({
      where: { id },
      data: { title, content, imageUrl },
    });

    revalidatePath("/articles");
    revalidatePath(`/articles/${article.slug}`);
    return NextResponse.json(article);
  } catch {
    return NextResponse.json({ error: "עדכון נכשל" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await db.article.delete({ where: { id } });

    revalidatePath("/articles");
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "מחיקה נכשלה" }, { status: 500 });
  }
}
