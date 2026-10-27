#!/usr/bin/env node
/**
 * FCC Explorer — tee-proxy /info UI.
 * Serves the static app, looks up PRODUCTION machines by extension id,
 * proxies GET /info (avoids browser CORS), and resolves InstructionSender.
 *
 *   npm start
 *   open http://127.0.0.1:3456
 */
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PROXY_INFO_URL,
  analyzeTeeInfo,
  normalizeInfoUrl,
  parseSignedTeeInfo,
} from "./lib/analyze.mjs";
import {
  getChain,
  lookupProductionExtension,
  lookupTeeMachine,
  normalizeAddress,
} from "./lib/chain.mjs";
import { lookupInstructionSender } from "./lib/instruction-sender.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3456);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY = 2 << 20;
const FETCH_TIMEOUT_MS = 20_000;

async function fetchInfo(infoUrl) {
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
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    const cause = e?.cause?.message || e?.cause?.code;
    throw new Error(cause ? `${e.message}: ${cause}` : e.message || String(e));
  } finally {
    clearTimeout(timer);
  }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: MAX_BODY }));

app.get("/api/analyze", async (req, res) => {
  const rawUrl = req.query.url || DEFAULT_PROXY_INFO_URL;
  let infoUrl;
  try {
    infoUrl = normalizeInfoUrl(String(rawUrl));
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
    return;
  }
  try {
    const json = await fetchInfo(infoUrl);
    const analyzed = analyzeTeeInfo(parseSignedTeeInfo(json));
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, source: infoUrl, analyzed });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message || String(e) });
  }
});

app.post("/api/analyze", (req, res) => {
  try {
    const analyzed = analyzeTeeInfo(parseSignedTeeInfo(req.body));
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, source: "paste", analyzed });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

app.get("/api/instruction-sender", async (req, res) => {
  const extensionId = req.query.extensionId;
  const chainId = req.query.chainId;
  try {
    const result = await lookupInstructionSender({ extensionId, chainId });
    res.set("Cache-Control", "no-store");
    res.json(result);
  } catch (e) {
    const status = e?.code === "UNSUPPORTED_CHAIN" ? 400 : 502;
    res.status(status).json({ ok: false, error: e.message || String(e) });
  }
});

app.get("/api/extension", async (req, res) => {
  const extensionId = req.query.extensionId;
  const chainId = req.query.chainId;
  const indexRaw = req.query.index;
  try {
    const found = await lookupProductionExtension({ extensionId, chainId });
    let index = 0;
    if (indexRaw != null && indexRaw !== "") {
      index = Number(indexRaw);
      if (!Number.isInteger(index) || index < 0) {
        res.status(400).json({ ok: false, error: `invalid index: ${indexRaw}` });
        return;
      }
    }

    const machine = found.machines[index] ?? null;
    let source = null;
    let analyzed = null;
    let fetchError = null;
    if (machine) {
      try {
        source = normalizeInfoUrl(machine.url);
        const json = await fetchInfo(source);
        analyzed = analyzeTeeInfo(parseSignedTeeInfo(json));
      } catch (e) {
        fetchError = e.message || String(e);
      }
    }

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      ...found,
      selected: machine ? index : null,
      source,
      analyzed,
      fetchError,
    });
  } catch (e) {
    const status = e?.code === "UNSUPPORTED_CHAIN" || e?.code === "BAD_INPUT" ? 400 : 502;
    res.status(status).json({ ok: false, error: e.message || String(e) });
  }
});

app.get("/api/machine-status", async (req, res) => {
  const teeIdRaw = req.query.teeId;
  const chainIdRaw = req.query.chainId;
  const extensionIdRaw = req.query.extensionId;
  try {
    const chainId = Number(chainIdRaw);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      res.status(400).json({ ok: false, error: `invalid chainId: ${chainIdRaw}` });
      return;
    }
    const chain = getChain(chainId);
    if (!chain) {
      res.status(400).json({ ok: false, error: `unsupported chainId ${chainId}` });
      return;
    }
    if (!teeIdRaw) {
      res.status(400).json({ ok: false, error: "teeId is required" });
      return;
    }
    const teeId = normalizeAddress(String(teeIdRaw));
    const machine = await lookupTeeMachine({
      chainId,
      teeId,
      extensionId: extensionIdRaw,
    });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, ...machine });
  } catch (e) {
    const status = e?.code === "UNSUPPORTED_CHAIN" ? 400 : 502;
    res.status(status).json({ ok: false, error: e.message || String(e) });
  }
});

app.use(express.static(PUBLIC));

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    res.status(413).json({ ok: false, error: `body larger than ${MAX_BODY} bytes` });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ ok: false, error: err.message || "body must be JSON" });
    return;
  }
  res.status(500).json({ ok: false, error: err?.message || String(err) });
});

if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`FCC Explorer → http://${HOST}:${PORT}`);
    console.log(`Default /info → ${DEFAULT_PROXY_INFO_URL}`);
  });
}

export default app;
