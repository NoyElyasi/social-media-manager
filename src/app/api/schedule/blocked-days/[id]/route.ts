import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.blockedDay.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
