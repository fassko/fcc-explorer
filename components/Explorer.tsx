"use client";

import { type Address } from "viem";
import { useCallback, useState } from "react";
import { DEFAULT_PROXY_INFO_URL, type AnalyzedTeeInfo } from "@/lib/analyze";
import { Field } from "@/components/Field";
import { InstructionSenderPanel } from "@/components/InstructionSenderPanel";
import {
  MachineStatusBadge,
  OnChainRegistry,
} from "@/components/OnChainMachine";
import { addrUrl, copyText, explorerBase, shortHex } from "@/lib/format";

type Mode = "extension" | "fetch" | "paste";

type MachineRow = { teeId: Address; url: string };

type ExtensionPayload = {
  ok: boolean;
  error?: string;
  extensionId?: string;
  chainId?: number;
  chainLabel?: string;
  instructionsSender?: string | null;
  machines?: MachineRow[];
  selected?: number | null;
  source?: string | null;
  analyzed?: AnalyzedTeeInfo | null;
  fetchError?: string | null;
};

const CLAIM_PREFER = [
  "iss",
  "sub",
  "aud",
  "hwmodel",
  "swname",
  "swversion",
  "secboot",
  "dbgstat",
  "eat_nonce",
  "google_service_accounts",
  "iat",
  "nbf",
  "exp",
];

function claimEntries(claims: Record<string, unknown>) {
  const shown = new Set(CLAIM_PREFER);
  const keys = [
    ...CLAIM_PREFER.filter((k) => k in claims),
    ...Object.keys(claims)
      .filter((k) => !shown.has(k))
      .sort(),
  ];
  return keys.map((k) => {
    const v = claims[k];
    const text =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);
    return [k, text] as const;
  });
}

function ProductionNote({
  data,
  onPick,
}: {
  data: ExtensionPayload;
  onPick: (index: number) => void;
}) {
  if (!data.machines?.length) return null;
  const n = data.machines.length;
  const which = n === 1 ? "1 PRODUCTION machine" : `${n} PRODUCTION machines`;
  return (
    <>
      <p className="lead" style={{ margin: "0 0 0.85rem" }}>
        {which} for extension{" "}
        <span className="mono">{String(data.extensionId)}</span> on{" "}
        {data.chainLabel || ""}.
      </p>
      {n > 1 ? (
        <div className="modes" role="tablist" style={{ margin: "0.55rem 0 0" }}>
          {data.machines.map((m, i) => (
            <button
              key={m.teeId}
              type="button"
              className="mode prod-pick"
              aria-pressed={i === data.selected}
              onClick={() => onPick(i)}
            >
              {shortHex(m.teeId, 6, 4)}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ResultsView({
  data,
  onPickMachine,
}: {
  data: ExtensionPayload & { analyzed: AnalyzedTeeInfo; source: string };
  onPickMachine: (index: number) => void;
}) {
  const a = data.analyzed;
  const ledger = a.ledgerState as Record<string, unknown> | null;
  const claims = a.attestationClaims;
  const chainId = a.chainId;
  const [showClaims, setShowClaims] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const queriedId =
    data.extensionId != null ? String(data.extensionId) : null;
  const idMismatch =
    queriedId != null && String(a.extensionId) !== queriedId;
  const registryTee = data.machines?.[data.selected ?? 0]?.teeId;
  const teeMismatch =
    registryTee &&
    a.teeId &&
    registryTee.toLowerCase() !== String(a.teeId).toLowerCase();

  const statusTee = (teeMismatch ? registryTee : a.teeId) as Address;
  const statusChain = data.chainId ?? a.chainId;
  const statusExt = queriedId ?? a.extensionId;

  const rawSans = { ...a.raw, attestation: "[omitted]" };

  return (
    <>
      <section className="panel">
        <ProductionNote data={data} onPick={onPickMachine} />
        <div className="panel-head">
          <div>
            <h2>Machine</h2>
            <p className="lead" style={{ margin: "0.25rem 0 0" }}>
              Source <span className="mono">{data.source}</span>
              {idMismatch ? (
                <span className="badge warn" style={{ marginLeft: ".4rem" }}>
                  proxy extension ≠ {queriedId}
                </span>
              ) : null}
              {teeMismatch ? (
                <span className="badge warn" style={{ marginLeft: ".4rem" }}>
                  proxy TEE ≠ registry
                </span>
              ) : null}
              {!a.keysMatch ? (
                <span className="badge warn" style={{ marginLeft: ".4rem" }}>
                  teeInfo / machineData keys differ
                </span>
              ) : null}
            </p>
          </div>
          <div id="machine-status">
            <MachineStatusBadge
              teeId={statusTee}
              chainId={statusChain}
              extensionId={statusExt}
              source={data.source}
              initialOwner={a.initialOwner}
            />
          </div>
        </div>
        <div className="grid">
          <Field label="Extension ID" mono copy={String(a.extensionId)}>
            {String(a.extensionId)}
          </Field>
          <Field label="Platform" mono>
            {a.platform || "—"}
          </Field>
          <Field label="Chain" mono>
            {`${a.chainLabel} (${a.chainId})`}
          </Field>
          <Field label="State version" mono>
            {a.stateVersion || "—"}
          </Field>
          <Field label="TEE id" copy={a.teeId}>
            <a
              className="mono"
              href={addrUrl(chainId, a.teeId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortHex(a.teeId, 8, 6)}
            </a>
          </Field>
          <Field label="Initial owner" copy={a.initialOwner}>
            <a
              className="mono"
              href={addrUrl(chainId, a.initialOwner)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortHex(a.initialOwner, 8, 6)}
            </a>
          </Field>
          <Field label="Signing policies" mono>
            {`${a.initialSigningPolicyId} → ${a.lastSigningPolicyId}`}
          </Field>
          <Field label="TEE timestamp" mono>
            {a.teeTimestampIso}
          </Field>
        </div>
        <div className="grid" style={{ marginTop: ".65rem" }}>
          <Field label="Code hash" mono copy={a.codeHash}>
            {shortHex(a.codeHash, 10, 8)}
          </Field>
          <Field label="Governance hash" mono copy={a.governanceHash}>
            {shortHex(a.governanceHash, 10, 8)}
          </Field>
          <Field label="Challenge" mono copy={a.challenge}>
            {shortHex(a.challenge, 10, 8)}
          </Field>
          <Field label="Signatures">
            {`data ${a.dataSignatureBytes}B · proxy ${a.proxySignatureBytes}B`}
          </Field>
        </div>
        <div id="onchain-machine" style={{ marginTop: "1rem" }}>
          <OnChainRegistry
            teeId={statusTee}
            chainId={statusChain}
            extensionId={statusExt}
            source={data.source}
            initialOwner={a.initialOwner}
          />
        </div>
      </section>

      <InstructionSenderPanel extensionId={statusExt} chainId={statusChain} />

      <section className="panel">
        <h2>Ledger state</h2>
        <p className="lead">
          Decoded from <span className="mono">teeInfo.state.state</span> (hex →
          UTF-8 JSON).
        </p>
        {ledger ? (
          <>
            <div className="grid">
              <Field label="Users">{String(ledger.userCount ?? "—")}</Field>
              <Field label="Virtual settlement RLUSD" mono>
                {String(ledger.virtualSettlementRlusd ?? "—")}
              </Field>
              <Field label="Processed txs">
                {String(ledger.processedTxCount ?? "—")}
              </Field>
              {ledger.pendingSettleNonce ? (
                <Field label="Pending settle nonce" mono>
                  {String(ledger.pendingSettleNonce)}
                </Field>
              ) : null}
              {ledger.pendingSettleRlusd ? (
                <Field label="Pending settle RLUSD" mono>
                  {String(ledger.pendingSettleRlusd)}
                </Field>
              ) : null}
            </div>
            <pre>{JSON.stringify(ledger, null, 2)}</pre>
          </>
        ) : (
          <>
            <p className="lead">
              {a.ledgerStateRaw
                ? "State is not JSON — showing raw below."
                : "Empty state (0x)."}
            </p>
            {a.ledgerStateRaw ? <pre>{a.ledgerStateRaw}</pre> : null}
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Attestation</h2>
            <p className="lead" style={{ margin: "0.25rem 0 0" }}>
              Kind: <span className="mono">{a.attestationKind}</span>
              {claims?.hwmodel ? ` · ${String(claims.hwmodel)}` : ""}
              {claims?.dbgstat ? ` · dbgstat=${String(claims.dbgstat)}` : ""}
            </p>
          </div>
          {claims ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => setShowClaims((v) => !v)}
            >
              {showClaims ? "Hide claims" : "Show claims"}
            </button>
          ) : null}
        </div>
        {claims && showClaims ? (
          <div className="table-wrap">
            <table>
              <tbody>
                {claimEntries(claims).map(([k, text]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {a.attestationKind === "string" ? (
          <pre>
            {a.raw.attestation.slice(0, 400)}
            {a.raw.attestation.length > 400 ? "…" : ""}
          </pre>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Raw JSON</h2>
          <div className="row">
            <button
              type="button"
              className="tiny"
              onClick={(e) =>
                copyText(JSON.stringify(a.raw)).then((ok) => {
                  if (ok) {
                    const btn = e.currentTarget;
                    const prev = btn.textContent;
                    btn.textContent = "Copied";
                    setTimeout(() => {
                      btn.textContent = prev;
                    }, 1100);
                  }
                })
              }
            >
              Copy full
            </button>
            <button
              type="button"
              className="tiny"
              onClick={(e) =>
                copyText(JSON.stringify(rawSans)).then((ok) => {
                  if (ok) {
                    const btn = e.currentTarget;
                    const prev = btn.textContent;
                    btn.textContent = "Copied";
                    setTimeout(() => {
                      btn.textContent = prev;
                    }, 1100);
                  }
                })
              }
            >
              Copy sans attestation
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {showRaw ? (
          <pre>
            {JSON.stringify(
              { ...a.raw, attestation: "[omitted — use Copy full]" },
              null,
              2,
            )}
          </pre>
        ) : null}
        <p className="lead" style={{ marginTop: ".75rem", marginBottom: 0 }}>
          Explorer:{" "}
          <a
            href={explorerBase(chainId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {a.chainLabel || "flare.network"}
          </a>
          {data.source && data.source !== "paste" ? (
            <>
              {" "}
              · Live proxy{" "}
              <a
                href={data.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                /info
              </a>
            </>
          ) : null}
        </p>
      </section>
    </>
  );
}

function ExtensionMiss({
  body,
  onPick,
}: {
  body: ExtensionPayload;
  onPick: (index: number) => void;
}) {
  const registered = Boolean(body.instructionsSender);
  const machines = Array.isArray(body.machines) ? body.machines : [];
  const chainId = body.chainId ?? 114;
  const lead = body.fetchError
    ? "The registry lists a PRODUCTION machine, but its proxy did not return /info."
    : registered
      ? `Registered on ${body.chainLabel}, with no machine in PRODUCTION.`
      : `No extension ${body.extensionId} is registered on ${body.chainLabel}.`;

  return (
    <>
      <section className="panel">
        <h2>Extension {String(body.extensionId)}</h2>
        <ProductionNote data={body} onPick={onPick} />
        <p className="lead">{lead}</p>
        {body.fetchError ? (
          <p className="lead err-inline">{body.fetchError}</p>
        ) : null}
        {machines.length ? (
          <div className="table-wrap data-table">
            <table>
              <thead>
                <tr>
                  <th>TEE id</th>
                  <th>Registered URL</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => (
                  <tr key={m.teeId}>
                    <td>
                      <a
                        className="mono"
                        href={addrUrl(chainId, m.teeId)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {shortHex(m.teeId, 8, 6)}
                      </a>
                    </td>
                    <td className="mono">{m.url || "—"}</td>
                    <td>
                      {m.url ? (
                        <a
                          href={`${String(m.url).replace(/\/$/, "")}/info`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          /info
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {registered && body.extensionId != null && body.chainId != null ? (
        <InstructionSenderPanel
          extensionId={body.extensionId}
          chainId={body.chainId}
        />
      ) : null}
    </>
  );
}

export function Explorer() {
  const [mode, setMode] = useState<Mode>("extension");
  const [extensionId, setExtensionId] = useState("");
  const [chainId, setChainId] = useState("114");
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [result, setResult] = useState<ExtensionPayload | null>(null);

  const findExtension = useCallback(
    async (index = 0, idOverride?: string, chainOverride?: string) => {
      setError("");
      const id = (idOverride ?? extensionId).trim();
      if (!id) {
        setError("Enter an extension id (decimal or 0x hex).");
        return;
      }
      setBusy(true);
      setBusyLabel("Finding…");
      try {
        const q = new URLSearchParams({
          extensionId: id,
          chainId: chainOverride ?? chainId,
          index: String(index),
        });
        const res = await fetch(`/api/extension?${q}`);
        const body = (await res.json()) as ExtensionPayload;
        if (!res.ok || !body.ok) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        if (body.extensionId) setExtensionId(body.extensionId);
        setResult(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [extensionId, chainId],
  );

  async function analyzeFetch() {
    setError("");
    const u = url.trim();
    if (!u) {
      setError("Enter a proxy /info URL, or use a preset.");
      return;
    }
    setBusy(true);
    setBusyLabel("Loading…");
    try {
      const res = await fetch(`/api/analyze?url=${encodeURIComponent(u)}`);
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        source?: string;
        analyzed?: AnalyzedTeeInfo;
      };
      if (!body.ok || !body.analyzed) {
        throw new Error(body.error || "analyze failed");
      }
      setResult({
        ok: true,
        source: body.source || u,
        analyzed: body.analyzed,
        chainId: body.analyzed.chainId,
        extensionId: String(body.analyzed.extensionId),
        machines: [],
        selected: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  async function analyzePaste() {
    setError("");
    setBusy(true);
    setBusyLabel("Parsing…");
    try {
      let json: unknown;
      try {
        json = JSON.parse(paste);
      } catch {
        throw new Error("paste is not valid JSON");
      }
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        source?: string;
        analyzed?: AnalyzedTeeInfo;
      };
      if (!body.ok || !body.analyzed) {
        throw new Error(body.error || "analyze failed");
      }
      setResult({
        ok: true,
        source: "paste",
        analyzed: body.analyzed,
        chainId: body.analyzed.chainId,
        extensionId: String(body.analyzed.extensionId),
        machines: [],
        selected: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  return (
    <main>
      <header>
        <p className="brand">FCC Explorer</p>
        <h1>
          Production <em>TEE</em>
        </h1>
        <p className="sub">
          Enter an extension id to open the machine in{" "}
          <span className="mono">PRODUCTION</span>, or decode a signed{" "}
          <span className="mono">GET /info</span> from a proxy URL.
        </p>
      </header>

      <section className="panel input-panel">
        <div className="modes" role="tablist">
          <button
            type="button"
            className="mode"
            aria-pressed={mode === "extension"}
            onClick={() => setMode("extension")}
          >
            Extension ID
          </button>
          <button
            type="button"
            className="mode"
            aria-pressed={mode === "fetch"}
            onClick={() => setMode("fetch")}
          >
            Fetch URL
          </button>
          <button
            type="button"
            className="mode"
            aria-pressed={mode === "paste"}
            onClick={() => setMode("paste")}
          >
            Paste JSON
          </button>
        </div>

        {mode === "extension" ? (
          <div>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label className="field">
                Extension ID
                <input
                  spellCheck={false}
                  inputMode="text"
                  placeholder="67278 or 0x106ce"
                  autoComplete="off"
                  value={extensionId}
                  onChange={(e) => setExtensionId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void findExtension(0);
                  }}
                />
              </label>
              <label className="field chain-field">
                Chain
                <select
                  value={chainId}
                  onChange={(e) => setChainId(e.target.value)}
                >
                  <option value="114">Coston2</option>
                  <option value="16">Coston</option>
                </select>
              </label>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void findExtension(0)}
              >
                {busy && busyLabel ? busyLabel : "Find"}
              </button>
            </div>
            <p className="presets">
              Preset:{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("extension");
                  setExtensionId("67278");
                  setChainId("114");
                  void findExtension(0, "67278", "114");
                }}
              >
                sandbox · 67278
              </button>
            </p>
          </div>
        ) : null}

        {mode === "fetch" ? (
          <div>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label className="field">
                Proxy /info URL
                <input
                  spellCheck={false}
                  placeholder="https://host:port/info"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void analyzeFetch();
                  }}
                />
              </label>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void analyzeFetch()}
              >
                {busy && busyLabel ? busyLabel : "Analyze"}
              </button>
            </div>
            <p className="presets">
              Presets:{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("fetch");
                  setUrl(DEFAULT_PROXY_INFO_URL);
                }}
              >
                sandbox
              </button>{" "}
              ·{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("fetch");
                  setUrl("http://127.0.0.1:52699/info");
                }}
              >
                local proxy
              </button>
            </p>
          </div>
        ) : null}

        {mode === "paste" ? (
          <div>
            <label className="field">
              Raw /info JSON
              <textarea
                spellCheck={false}
                placeholder='{"teeInfo":…,"machineData":…,"dataSignature":…,"attestation":…,"proxySignature":…}'
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn"
              style={{ marginTop: "0.65rem" }}
              disabled={busy}
              onClick={() => void analyzePaste()}
            >
              {busy && busyLabel ? busyLabel : "Analyze paste"}
            </button>
          </div>
        ) : null}

        {error ? <p className="err">{error}</p> : null}
      </section>

      {result?.analyzed && result.source != null ? (
        <ResultsView
          data={
            result as ExtensionPayload & {
              analyzed: AnalyzedTeeInfo;
              source: string;
            }
          }
          onPickMachine={(i) => void findExtension(i)}
        />
      ) : result && !result.analyzed ? (
        <ExtensionMiss
          body={result}
          onPick={(i) => void findExtension(i)}
        />
      ) : null}
    </main>
  );
}
