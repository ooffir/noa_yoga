import { NextResponse } from "next/server";
import { generateClassInstances } from "@/lib/schedule-service";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const created = await generateClassInstances(4);
    return NextResponse.json({ created: created.length, instances: created });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate instances" },
      { status: 500 }
    );
  }
}
