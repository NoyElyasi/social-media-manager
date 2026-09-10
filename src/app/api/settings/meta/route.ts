import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import {
  connectMetaAccount,
  disconnectMetaAccount,
  getMetaConnectionStatus,
  MetaApiError,
} from "@/server/settings/meta";

export async function GET() {
  const status = await getMetaConnectionStatus();
  return NextResponse.json({ status });
}

const connectSchema = z.object({
  shortLivedToken: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  try {
    await connectMetaAccount(parsed.data.shortLivedToken);
  } catch (err) {
    if (err instanceof MetaApiError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const status = await getMetaConnectionStatus();
  return NextResponse.json({ status });
}

export async function DELETE() {
  await disconnectMetaAccount();
  const status = await getMetaConnectionStatus();
  return NextResponse.json({ status });
}
