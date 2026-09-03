import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { updatePostRawText } from "@/server/content/preparePost";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: { platformContents: true },
  });

  if (!post) {
    return NextResponse.json({ error: "פוסט לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ post });
}

const updatePostSchema = z.object({
  rawText: z.string().min(1, "יש להזין טקסט לפוסט"),
});

/** מעדכן את הטקסט הגולמי של הפוסט, ומרנדר מחדש את כל התכנים שכבר הוכנו לו. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updatePostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "פוסט לא נמצא" }, { status: 404 });
  }

  try {
    const post = await updatePostRawText(id, parsed.data.rawText);
    return NextResponse.json({ post });
  } catch (err) {
    console.error("Failed to update post:", err);
    return NextResponse.json(
      { error: { formErrors: ["שגיאה בעדכון הפוסט — נסו שוב"] } },
      { status: 500 }
    );
  }
}
