import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";

const patchSchema = z.object({
  hour: z.number().int().min(0).max(23).optional(),
  platformContentId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  actualStatus: z.enum(["pending", "done", "skipped"]).optional(),
});

/** כל עדכון ידני לסלוט קיים "נועל" אותו (isManual=true) — לא יימחק/יידרס ברענון הצעה. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const { actualStatus, ...rest } = parsed.data;

  const updated = await prisma.scheduledSlot.update({
    where: { id },
    data: {
      ...rest,
      isManual: true,
      // actualAt נקבע כאן לפי "עכשיו", לא מתקבל מהלקוח — זה זמן הסימון, לא ניסיון לתעד שעת פרסום מדויקת בפועל.
      ...(actualStatus !== undefined ? { actualStatus, actualAt: actualStatus === "done" ? new Date() : null } : {}),
    },
  });

  return NextResponse.json({ slot: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.scheduledSlot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
