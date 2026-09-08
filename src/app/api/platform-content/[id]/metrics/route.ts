import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";

/**
 * נתוני ביצועים מוזנים ידנית (המשתמשת קוראת אותם ישירות מתובנות אינסטגרם/
 * פייסבוק) — אין חיבור API ל-Meta, לפי בחירה מפורשת. שדה ריק (undefined)
 * לא נוגע בערך הקיים; שליחת null מוחקת אותו במפורש.
 */
const metricsSchema = z.object({
  likesCount: z.number().int().min(0).nullable().optional(),
  commentsCount: z.number().int().min(0).nullable().optional(),
  viewsCount: z.number().int().min(0).nullable().optional(),
  avgWatchSeconds: z.number().min(0).nullable().optional(),
  followersReachPercent: z.number().min(0).max(100).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = metricsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const updated = await prisma.platformContent.update({
    where: { id },
    data: {
      ...parsed.data,
      metricsUpdatedAt: new Date(),
    },
  });

  return NextResponse.json({ platformContent: updated });
}
