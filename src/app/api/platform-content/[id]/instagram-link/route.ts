import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { linkInstagramMedia } from "@/server/settings/meta";

const linkSchema = z.object({
  instagramMediaId: z.string().min(1),
  instagramPermalink: z.string().min(1),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const updated = await linkInstagramMedia(id, parsed.data.instagramMediaId, parsed.data.instagramPermalink);
  return NextResponse.json({ platformContent: updated });
}
