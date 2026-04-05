import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/get-db-user";

const SUPABASE_URL = process.env.DIRECT_URL?.match(
  /postgresql:\/\/([^:]+):([^@]+)@([^:\/]+)/
);
const PROJECT_REF = process.env.DATABASE_URL?.match(
  /postgres\.([a-z0-9]+):/
)?.[1];

const SUPABASE_REST_URL = PROJECT_REF
  ? `https://${PROJECT_REF}.supabase.co`
  : null;

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "קובץ נדרש" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `articles/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    if (SUPABASE_REST_URL && SUPABASE_SERVICE_KEY) {
      const bytes = await file.arrayBuffer();

      const uploadRes = await fetch(
        `${SUPABASE_REST_URL}/storage/v1/object/public-images/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": file.type,
            "x-upsert": "true",
          },
          body: bytes,
        }
      );

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        console.error("Supabase storage upload failed:", err);
        return NextResponse.json(
          { error: "העלאה נכשלה. ודאו שנוצר Bucket בשם public-images בסופאבייס." },
          { status: 500 }
        );
      }

      const publicUrl = `${SUPABASE_REST_URL}/storage/v1/object/public/public-images/${fileName}`;
      return NextResponse.json({ url: publicUrl });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = `data:${file.type};base64,${bytes.toString("base64")}`;
    return NextResponse.json({ url: base64 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "העלאה נכשלה" }, { status: 500 });
  }
}
