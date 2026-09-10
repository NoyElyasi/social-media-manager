import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { backfillInstagramMetrics, MetaApiError } from "@/server/settings/meta";

const backfillSchema = z.object({
  sinceDate: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = backfillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  try {
    const report = await backfillInstagramMetrics(new Date(parsed.data.sinceDate));
    return NextResponse.json({ report });
  } catch (err) {
    if (err instanceof MetaApiError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
