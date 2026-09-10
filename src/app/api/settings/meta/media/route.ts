import { NextResponse } from "next/server";
import { fetchRecentInstagramMedia, MetaApiError } from "@/server/settings/meta";

export async function GET() {
  try {
    const media = await fetchRecentInstagramMedia();
    return NextResponse.json({ media });
  } catch (err) {
    if (err instanceof MetaApiError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
