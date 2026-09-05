import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { createAndPreparePost } from "@/server/content/preparePost";

const createPostSchema = z.object({
  rawText: z.string().min(1, "יש להזין טקסט לפוסט"),
  selectedTargets: z
    .array(z.enum(["facebook_post", "instagram_carousel", "instagram_reel"]))
    .min(1, "יש לבחור לפחות יעד אחד"),
  carouselSplitMode: z.enum(["auto", "manual"]).optional(),
  manualHashtags: z.array(z.string()).optional().nullable(),
});

export async function GET() {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: { platformContents: true },
  });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  try {
    const post = await createAndPreparePost(parsed.data);
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    console.error("Failed to create post:", err);
    return NextResponse.json(
      { error: { formErrors: ["שגיאה בהכנת הפוסט — נסו שוב"] } },
      { status: 500 }
    );
  }
}
