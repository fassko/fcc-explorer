import { NextRequest, NextResponse } from "next/server";
import { getChain, lookupTeeMachine, normalizeAddress } from "@/lib/chain";

export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  const teeIdRaw = req.nextUrl.searchParams.get("teeId");
  const chainIdRaw = req.nextUrl.searchParams.get("chainId");
  const extensionIdRaw = req.nextUrl.searchParams.get("extensionId");

  try {
    const chainId = Number(chainIdRaw);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return noStore({ ok: false, error: `invalid chainId: ${chainIdRaw}` }, 400);
    }
    const chain = getChain(chainId);
    if (!chain) {
      return noStore(
        { ok: false, error: `unsupported chainId ${chainId}` },
        400,
      );
    }
    if (!teeIdRaw) {
      return noStore({ ok: false, error: "teeId is required" }, 400);
    }
    const teeId = normalizeAddress(String(teeIdRaw));
    const machine = await lookupTeeMachine({
      chainId,
      teeId,
      extensionId: extensionIdRaw,
    });
    return noStore({ ok: true, ...machine });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err?.code === "UNSUPPORTED_CHAIN" ? 400 : 502;
    return noStore({ ok: false, error: err.message || String(err) }, status);
  }
}
