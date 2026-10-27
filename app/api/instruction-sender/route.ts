import { NextRequest, NextResponse } from "next/server";
import { lookupInstructionSender } from "@/lib/instruction-sender";

export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  const extensionId = req.nextUrl.searchParams.get("extensionId");
  const chainId = req.nextUrl.searchParams.get("chainId");
  try {
    const result = await lookupInstructionSender({ extensionId, chainId });
    return noStore(result);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err?.code === "UNSUPPORTED_CHAIN" ? 400 : 502;
    return noStore({ ok: false, error: err.message || String(err) }, status);
  }
}
