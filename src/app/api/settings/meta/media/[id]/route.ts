import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { classifyInstagramMediaManually } from "@/server/settings/meta";

const patchSchema = z.object({
  aiTheme: z.string().nullable().optional(),
  aiFormat: z.enum(["letter", "regular"]).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const updated = await classifyInstagramMediaManually(id, parsed.data);
  return NextResponse.json({ media: updated });
}
