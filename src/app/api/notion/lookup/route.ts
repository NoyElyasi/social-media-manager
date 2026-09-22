import { NextRequest, NextResponse } from "next/server";
import { findReadySegmentByTag } from "@/server/notion";

/** מחפשת קטע "מוכן" ב-Notion לפי תגית — ראו findReadySegmentByTag. */
export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag")?.trim();
  if (!tag) {
    return NextResponse.json({ error: "יש לציין תגית" }, { status: 400 });
  }

  const result = await findReadySegmentByTag(tag);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ segment: result.segment });
}
