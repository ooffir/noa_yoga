import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDbUser } from "@/lib/get-db-user";
import { db } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const updated = await db.classInstance.update({
      where: { id },
      data: {
        isCancelled: body.isCancelled ?? undefined,
        startTime: body.startTime ?? undefined,
        endTime: body.endTime ?? undefined,
        maxCapacity: body.maxCapacity ?? undefined,
      },
    });

    revalidateTag("schedule", "max");
    revalidatePath("/schedule");
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "עדכון נכשל" }, { status: 500 });
  }
}
