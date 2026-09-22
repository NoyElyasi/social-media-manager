import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { PlatformType } from "@/generated/prisma/client";

/**
 * תוכן לבחירה ידנית לסלוט — גם "מוכן" וגם "טיוטה" (עדיין בעבודה, לא רק
 * status=ready), כדי שאפשר לתכנן/לשמור מקום גם לתוכן שעוד לא הושלם, ולא רק
 * לאחר שהוא סומן מוכן. לא כולל "פורסם"/"מתוזמן" (כבר טופל), ולא תוכן ששובץ
 * לסלוט אחר.
 */
export async function GET() {
  const items = await prisma.platformContent.findMany({
    where: {
      status: { in: ["draft", "ready"] },
      scheduledSlot: null,
      type: { in: [PlatformType.instagram_reel, PlatformType.instagram_carousel] },
    },
    include: { post: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    items: items.map((pc) => ({
      id: pc.id,
      postId: pc.postId,
      type: pc.type,
      text: pc.text,
      status: pc.status,
      createdAt: pc.createdAt,
    })),
  });
}
