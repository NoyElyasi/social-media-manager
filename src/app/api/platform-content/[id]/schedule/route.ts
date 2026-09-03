import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { computeScheduledAt } from "@/server/content/scheduling";

const scheduleSchema = z.object({
  mode: z.enum(["exact", "auto"]),
  date: z.string(), // ISO date string, למשל "2026-09-10"
  exactHour: z.number().min(0).max(23).optional(),
  exactMinute: z.number().min(0).max(59).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = scheduleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const content = await prisma.platformContent.findUnique({ where: { id } });
  if (!content) {
    return NextResponse.json({ error: "תוכן לא נמצא" }, { status: 404 });
  }

  const scheduledAt = computeScheduledAt({
    platform: content.type,
    mode: parsed.data.mode,
    date: new Date(parsed.data.date),
    exactHour: parsed.data.exactHour,
    exactMinute: parsed.data.exactMinute,
  });

  const updated = await prisma.platformContent.update({
    where: { id },
    data: {
      scheduleMode: parsed.data.mode,
      scheduledAt,
      status: "scheduled",
    },
  });

  return NextResponse.json({ platformContent: updated });
}
