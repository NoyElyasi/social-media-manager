import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { addTargetToPost } from "@/server/content/preparePost";

/** מוסיף יעד (קרוסלה/ריל) לפוסט קיים, גם אם לא נבחר ביצירה הראשונית. */
const addTargetSchema = z.object({
  target: z.enum(["instagram_carousel", "instagram_reel"]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = addTargetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "פוסט לא נמצא" }, { status: 404 });
  }

  try {
    const post = await addTargetToPost(id, parsed.data.target);
    return NextResponse.json({ post });
  } catch (err) {
    console.error("Failed to add target to post:", err);
    const message = err instanceof Error ? err.message : "שגיאה בהוספת היעד — נסו שוב";
    return NextResponse.json({ error: { formErrors: [message] } }, { status: 500 });
  }
}
