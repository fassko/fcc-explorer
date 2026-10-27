"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/Field";
import { formatTs, shortHex } from "@/lib/format";

type Method = {
  name: string;
  selector: string;
  stateMutability: string;
  inputs: { name: string; type: string }[];
};

type Tx = {
  hash: string;
  method: string | null;
  status: string | null;
  timestamp: string | null;
  explorerUrl: string | null;
};

type SenderBody = {
  ok?: boolean;
  error?: string;
  address?: string | null;
  name?: string | null;
  verified?: boolean;
  chainLabel?: string;
  methods?: Method[];
  transactions?: Tx[];
  explorerAddressUrl?: string | null;
  explorerError?: string;
};

const METHOD_GROUPS = [
  {
    key: "payable",
    title: "Payable",
    hint: "Send instructions (pay fee)",
    match: (m: Method) => m.stateMutability === "payable",
  },
  {
    key: "write",
    title: "Write",
    hint: "State-changing, no value",
    match: (m: Method) => m.stateMutability === "nonpayable",
  },
  {
    key: "read",
    title: "Read",
    hint: "View / pure",
    match: (m: Method) =>
      m.stateMutability === "view" || m.stateMutability === "pure",
  },
] as const;

function formatMethodSig(m: Method): string {
  const args = (m.inputs || [])
    .map((i) => (i.name ? `${i.type} ${i.name}` : i.type))
    .join(", ");
  return `${m.name}(${args})`;
}

function MethodsGrouped({ methods }: { methods: Method[] }) {
  const unused = new Set(methods);
  const sections = METHOD_GROUPS.map((g) => {
    const list = methods
      .filter(g.match)
      .sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((m) => unused.delete(m));
    if (!list.length) return null;
    return (
      <div className="method-group" data-kind={g.key} key={g.key}>
        <div className="method-group-head">
          <h4>{g.title}</h4>
          <span className="muted">
            {g.hint} · {list.length}
          </span>
        </div>
        <ul className="method-list">
          {list.map((m) => (
            <li className="mono" key={m.selector}>
              {formatMethodSig(m)}
            </li>
          ))}
        </ul>
      </div>
    );
  });

  const other = [...unused].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <h3 className="subhead">Available methods</h3>
      <div className="method-groups">
        {sections}
        {other.length ? (
          <div className="method-group" data-kind="other">
            <div className="method-group-head">
              <h4>Other</h4>
              <span className="muted">{other.length}</span>
            </div>
            <ul className="method-list">
              {other.map((m) => (
                <li className="mono" key={m.selector}>
                  <span className="muted">{m.stateMutability || "?"}</span>{" "}
                  {formatMethodSig(m)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function InstructionSenderPanel({
  extensionId,
  chainId,
}: {
  extensionId: string | number;
  chainId: number;
}) {
  const [body, setBody] = useState<SenderBody | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBody(null);
    (async () => {
      try {
        const q = new URLSearchParams({
          extensionId: String(extensionId),
          chainId: String(chainId),
        });
        const res = await fetch(`/api/instruction-sender?${q}`);
        const json = (await res.json()) as SenderBody;
        if (!cancelled) setBody(json);
      } catch (e) {
        if (!cancelled) {
          setBody({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [extensionId, chainId]);

  if (!body) {
    return (
      <section className="panel" id="sender-panel">
        <h2>Instruction sender</h2>
        <p className="lead">Looking up registry + explorer…</p>
      </section>
    );
  }

  if (!body.ok) {
    return (
      <section className="panel" id="sender-panel">
        <h2>Instruction sender</h2>
        <p className="lead err-inline">{body.error || "lookup failed"}</p>
      </section>
    );
  }

  if (!body.address) {
    return (
      <section className="panel" id="sender-panel">
        <h2>Instruction sender</h2>
        <p className="lead">
          No instructions sender registered for this extension.
        </p>
      </section>
    );
  }

  const selectorToName = new Map(
    (body.methods || [])
      .filter((m) => m.selector && m.name)
      .map((m) => [String(m.selector).toLowerCase(), m.name]),
  );

  function displayMethod(raw: string | null) {
    if (!raw) return "—";
    if (/^0x[0-9a-fA-F]{8}$/.test(raw) && selectorToName.has(raw.toLowerCase())) {
      return selectorToName.get(raw.toLowerCase())!;
    }
    return raw;
  }

  const txs = body.transactions || [];

  return (
    <section className="panel" id="sender-panel">
      <div className="panel-head">
        <div>
          <h2>Instruction sender</h2>
          <p className="lead" style={{ margin: "0.25rem 0 0" }}>
            {body.name || "Contract"} ·{" "}
            {body.verified ? (
              <span className="badge ok">verified</span>
            ) : (
              <span className="badge warn">unverified</span>
            )}
            {body.chainLabel ? ` · ${body.chainLabel}` : ""}
          </p>
        </div>
      </div>
      <div className="grid" style={{ marginTop: ".65rem" }}>
        <Field label="Address" copy={body.address}>
          <a
            className="mono"
            href={body.explorerAddressUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortHex(body.address, 8, 6)}
          </a>
        </Field>
      </div>
      {body.explorerError ? (
        <p className="lead err-inline">Explorer: {body.explorerError}</p>
      ) : null}
      {body.verified && body.methods?.length ? (
        <MethodsGrouped methods={body.methods} />
      ) : body.verified ? (
        <p className="lead">Verified, but no ABI functions found.</p>
      ) : (
        <p className="lead">
          ABI methods are shown only when the contract is verified on the
          explorer.
        </p>
      )}
      <h3 className="subhead">Recent transactions</h3>
      {txs.length > 0 ? (
        <div className="table-wrap data-table">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Method</th>
                <th>Status</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.hash}>
                  <td className="mono muted">{formatTs(t.timestamp)}</td>
                  <td className="mono">{displayMethod(t.method)}</td>
                  <td className="mono">{t.status || "—"}</td>
                  <td>
                    <a
                      className="mono"
                      href={t.explorerUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {shortHex(t.hash, 8, 6)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="lead">No recent transactions.</p>
      )}
    </section>
  );
}
