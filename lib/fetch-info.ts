const MAX_BODY = 2 << 20;
const FETCH_TIMEOUT_MS = 20_000;

export async function fetchProxyInfo(infoUrl: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(infoUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200);
      throw new Error(`proxy ${res.status}: ${text || res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BODY) {
      throw new Error(`response larger than ${MAX_BODY} bytes`);
    }
    return JSON.parse(buf.toString("utf8")) as unknown;
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; code?: string }; name?: string };
    if (err?.name === "AbortError") {
      throw new Error(`timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    const cause = err?.cause?.message || err?.cause?.code;
    throw new Error(
      cause ? `${err.message}: ${cause}` : err.message || String(err),
    );
  } finally {
    clearTimeout(timer);
  }
}

export { MAX_BODY };
