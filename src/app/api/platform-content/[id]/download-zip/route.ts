import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/server/db";
import { getStorageService } from "@/server/storage";

/** מוריד את כל תמונות התוכן (למשל כל עמודי הקרוסלה) כקובץ ZIP אחד. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = await prisma.platformContent.findUnique({ where: { id }, include: { post: true } });

  if (!content) {
    return NextResponse.json({ error: "תוכן לא נמצא" }, { status: 404 });
  }

  const files: string[] = JSON.parse(content.files || "[]");
  if (files.length === 0) {
    return NextResponse.json({ error: "אין תמונות להורדה" }, { status: 400 });
  }

  const storage = getStorageService();
  const zip = new JSZip();

  for (const fileName of files) {
    const buffer = await storage.readFile(content.folderPath, fileName);
    zip.file(fileName, buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const zipName = `${content.post.slug}-${content.type}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(zipName)}"`,
    },
  });
}
