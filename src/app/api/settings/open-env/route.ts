import { NextResponse } from "next/server";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** פותחת את קובץ ה-.env בשורש הפרויקט באפליקציה שמוגדרת כברירת מחדל (macOS "open") — כדי להכניס בקלות סודות כמו NOTION_API_KEY. */
export async function POST() {
  const envPath = path.join(process.cwd(), ".env");

  try {
    await execFileAsync("open", [envPath]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to open .env file:", err);
    return NextResponse.json({ error: "שגיאה בפתיחת קובץ ה-.env" }, { status: 500 });
  }
}
