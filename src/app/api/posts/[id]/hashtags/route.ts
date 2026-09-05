import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { updatePostHashtags } from "@/server/content/preparePost";

/**
 * מעדכן את התגיות המשותפות של הפוסט — כל התוכן של הפוסט משתמש בדיוק
 * אותן תגיות, אין יותר עריכה נפרדת לכל יעד.
 */
const hashtagsSchema = z.object({
  hashtags: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = hashtagsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "פוסט לא נמצא" }, { status: 404 });
  }

  try {
    const post = await updatePostHashtags(id, parsed.data.hashtags ?? []);
    return NextResponse.json({ post });
  } catch (err) {
    console.error("Failed to update post hashtags:", err);
    return NextResponse.json(
      { error: { formErrors: ["שגיאה בעדכון התגיות — נסו שוב"] } },
      { status: 500 }
    );
  }
}
