import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/server/db";

const execFileAsync = promisify(execFile);

/**
 * פותחת ב-Finder את תיקיית הפוסט הראשית (לא תת-תיקייה של יעד ספציפי — לפי
 * בקשה מפורשת "לינק יחיד לתיקייה הראשית"). רלוונטי רק לאחסון מקומי (macOS
 * "open") — אין מובן ל"תיקייה ב-Finder" כשהאחסון הוא Google Drive.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if ((process.env.STORAGE_PROVIDER ?? "local") !== "local") {
    return NextResponse.json({ error: "פתיחת תיקייה נתמכת רק באחסון מקומי" }, { status: 400 });
  }

  const { id } = await params;
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    return NextResponse.json({ error: "פוסט לא נמצא" }, { status: 404 });
  }

  const root = process.env.LOCAL_STORAGE_ROOT
    ? path.resolve(process.env.LOCAL_STORAGE_ROOT)
    : path.join(process.cwd(), "storage");
  const absolutePath = path.join(root, post.folderPath);

  try {
    await execFileAsync("open", [absolutePath]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to open post folder:", err);
    return NextResponse.json({ error: "שגיאה בפתיחת התיקייה" }, { status: 500 });
  }
}
