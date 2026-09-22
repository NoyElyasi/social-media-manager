import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";

const bodySchema = z.object({
  notionUrl: z.string().nullable(),
});

/** מעדכן את קישור ה-Notion של הפוסט (ראו PostContentPopup בתכנון השבועי) — לא משפיע על שום דבר אחר. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const post = await prisma.post.update({
    where: { id },
    data: { notionUrl: parsed.data.notionUrl?.trim() || null },
  });

  return NextResponse.json({ post });
}
