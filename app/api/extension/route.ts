import { NextRequest, NextResponse } from "next/server";
import {
  analyzeTeeInfo,
  normalizeInfoUrl,
  parseSignedTeeInfo,
} from "@/lib/analyze";
import { lookupProductionExtension } from "@/lib/chain";
import { fetchProxyInfo } from "@/lib/fetch-info";

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
  const indexRaw = req.nextUrl.searchParams.get("index");

  try {
    const found = await lookupProductionExtension({ extensionId, chainId: chainId ?? "" });
    let index = 0;
    if (indexRaw != null && indexRaw !== "") {
      index = Number(indexRaw);
      if (!Number.isInteger(index) || index < 0) {
        return noStore({ ok: false, error: `invalid index: ${indexRaw}` }, 400);
      }
    }

    const machine = found.machines[index] ?? null;
    let source: string | null = null;
    let analyzed = null;
    let fetchError: string | null = null;
    if (machine) {
      try {
        source = normalizeInfoUrl(machine.url);
        const json = await fetchProxyInfo(source);
        analyzed = analyzeTeeInfo(parseSignedTeeInfo(json));
      } catch (e) {
        fetchError = e instanceof Error ? e.message : String(e);
      }
    }

    return noStore({
      ok: true,
      ...found,
      selected: machine ? index : null,
      source,
      analyzed,
      fetchError,
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err?.code === "UNSUPPORTED_CHAIN" || err?.code === "BAD_INPUT" ? 400 : 502;
    return noStore({ ok: false, error: err.message || String(err) }, status);
  }
}
