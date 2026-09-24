import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";

const bodySchema = z.object({ slotIdA: z.string(), slotIdB: z.string() });

/**
 * מחליפה את *התוכן* בין שני שיבוצים — לא את היום/שעה. היום/שעה של כל שיבוץ
 * נבחרו במיוחד בשבילו (לפי חוזק היום/השעה שלו) — לפי בקשה מפורשת, החלפת
 * תוכן בין שני ימים לא אמורה "לסחוב" את השעה המקורית איתה, רק את מה
 * שמתפרסם. שני השיבוצים ננעלים (isManual) בסוף — זו עריכה ידנית מפורשת.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const { slotIdA, slotIdB } = parsed.data;
  if (slotIdA === slotIdB) {
    return NextResponse.json({ error: "אי אפשר להחליף שיבוץ עם עצמו" }, { status: 400 });
  }

  const [a, b] = await Promise.all([
    prisma.scheduledSlot.findUnique({ where: { id: slotIdA } }),
    prisma.scheduledSlot.findUnique({ where: { id: slotIdB } }),
  ]);
  if (!a || !b) {
    return NextResponse.json({ error: "שיבוץ לא נמצא" }, { status: 404 });
  }

  const contentOf = (s: typeof a) => ({
    platformContentId: s.platformContentId,
    plannedType: s.plannedType,
    plannedFormat: s.plannedFormat,
    plannedReelCandidateMediaId: s.plannedReelCandidateMediaId,
    plannedNotionTag: s.plannedNotionTag,
    plannedNotionPreview: s.plannedNotionPreview,
    plannedNotionPageUrl: s.plannedNotionPageUrl,
  });
  const contentA = contentOf(a);
  const contentB = contentOf(b);

  // platformContentId ייחודי (unique) — מנקים קודם את שני השיבוצים מהתוכן
  // המקומי שלהם, כדי לא להתנגש בביניים, ורק אז מציבים את הערכים המוחלפים.
  await prisma.$transaction([
    prisma.scheduledSlot.update({ where: { id: slotIdA }, data: { platformContentId: null } }),
    prisma.scheduledSlot.update({ where: { id: slotIdB }, data: { platformContentId: null } }),
    prisma.scheduledSlot.update({ where: { id: slotIdA }, data: { ...contentB, isManual: true } }),
    prisma.scheduledSlot.update({ where: { id: slotIdB }, data: { ...contentA, isManual: true } }),
  ]);

  return NextResponse.json({ ok: true });
}
