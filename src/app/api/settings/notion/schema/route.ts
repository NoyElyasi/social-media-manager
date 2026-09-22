import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { fetchDatabaseSchema } from "@/server/notion";

const bodySchema = z.object({ databaseUrl: z.string().min(1) });

/** "בדיקת חיבור" בהגדרות — שולפת את סכימת הטבלה (לפני שהלינק בהכרח נשמר) לצורך מיפוי עמודות. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const result = await fetchDatabaseSchema(parsed.data.databaseUrl);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ title: result.title, properties: result.properties });
}
