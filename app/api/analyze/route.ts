import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PROXY_INFO_URL,
  analyzeTeeInfo,
  normalizeInfoUrl,
  parseSignedTeeInfo,
} from "@/lib/analyze";
import { fetchProxyInfo, MAX_BODY } from "@/lib/fetch-info";

export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url") || DEFAULT_PROXY_INFO_URL;
  let infoUrl: string;
  try {
    infoUrl = normalizeInfoUrl(String(rawUrl));
  } catch (e) {
    return noStore(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      400,
    );
  }
  try {
    const json = await fetchProxyInfo(infoUrl);
    const analyzed = analyzeTeeInfo(parseSignedTeeInfo(json));
    return noStore({ ok: true, source: infoUrl, analyzed });
  } catch (e) {
    return noStore(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY) {
      return noStore(
        { ok: false, error: `body larger than ${MAX_BODY} bytes` },
        413,
      );
    }
    const body = await req.json();
    const analyzed = analyzeTeeInfo(parseSignedTeeInfo(body));
    return noStore({ ok: true, source: "paste", analyzed });
  } catch (e) {
    return noStore(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      400,
    );
  }
}
