import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";

const statusSchema = z.object({
  status: z.enum(["draft", "ready", "scheduled", "published"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = statusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const updated = await prisma.platformContent.update({
    where: { id },
    data: {
      status: parsed.data.status,
      publishedAt: parsed.data.status === "published" ? new Date() : undefined,
    },
  });

  return NextResponse.json({ platformContent: updated });
}
