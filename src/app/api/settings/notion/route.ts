import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";

const propertyRefSchema = z.object({ name: z.string(), type: z.string() });
const propertyMapSchema = z.object({
  tag: propertyRefSchema,
  status: propertyRefSchema.extend({ readyValue: z.string() }),
  type: propertyRefSchema.nullable(),
  tags: propertyRefSchema.nullable(),
});

const bodySchema = z.object({
  databaseUrl: z.string().nullable(),
  propertyMap: propertyMapSchema.nullable().optional(),
});

/** מצב חיבור Notion — הלינק+המיפוי (לא סודיים) מה-DB, ורק דגל אם NOTION_API_KEY מוגדר ב-.env. */
export async function GET() {
  const profile = await prisma.profileSettings.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    apiKeyConfigured: !!process.env.NOTION_API_KEY?.trim(),
    databaseUrl: profile?.notionDatabaseUrl ?? null,
    propertyMap: profile?.notionPropertyMap ? JSON.parse(profile.notionPropertyMap) : null,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const profile = await prisma.profileSettings.update({
    where: { id: "default" },
    data: {
      notionDatabaseUrl: parsed.data.databaseUrl,
      ...(parsed.data.propertyMap !== undefined ? { notionPropertyMap: parsed.data.propertyMap ? JSON.stringify(parsed.data.propertyMap) : null } : {}),
    },
  });

  return NextResponse.json({
    databaseUrl: profile.notionDatabaseUrl,
    propertyMap: profile.notionPropertyMap ? JSON.parse(profile.notionPropertyMap) : null,
  });
}
