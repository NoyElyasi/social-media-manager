import { NextResponse } from "next/server";
import { listReadySegments } from "@/server/notion";

/** כל התגיות "מוכן" (Ready) בנושיין — לדרופ-דאון של שם/הערה בפאנל השיבוץ, ראו ScheduleSlotEditorPanel. */
export async function GET() {
  const rows = await listReadySegments();
  return NextResponse.json({ tags: rows.map((r) => ({ tag: r.tag, typeValues: r.typeValues })) });
}
