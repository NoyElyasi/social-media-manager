import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

const STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT
  ? path.resolve(process.env.LOCAL_STORAGE_ROOT)
  : path.join(process.cwd(), "storage");

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

/** משגש קבצים מתוך תיקיית האחסון המקומית (סעיף 9) לתצוגה בממשק. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const requestedPath = path.join(STORAGE_ROOT, ...segments);
  const resolved = path.normalize(requestedPath);

  if (!resolved.startsWith(STORAGE_ROOT)) {
    return NextResponse.json({ error: "נתיב לא חוקי" }, { status: 400 });
  }

  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = EXT_TO_MIME[ext] ?? "application/octet-stream";
    return new NextResponse(data, { headers: { "Content-Type": contentType } });
  } catch {
    return NextResponse.json({ error: "קובץ לא נמצא" }, { status: 404 });
  }
}
