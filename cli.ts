#!/usr/bin/env node
/**
 * Decode a tee-proxy GET /info on the command line.
 *
 *   npm run cli
 *   npm run cli -- http://127.0.0.1:52699/info
 *   curl -sS <proxy>/info | npm run cli -- --stdin
 */

import {
  DEFAULT_PROXY_INFO_URL,
  analyzeTeeInfo,
  normalizeInfoUrl,
  parseSignedTeeInfo,
  shortHex,
  type AnalyzedTeeInfo,
} from "./lib/analyze";
import { lookupTeeMachine } from "./lib/chain";

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function print(
  analyzed: AnalyzedTeeInfo,
  source: string,
  onchain: Awaited<ReturnType<typeof lookupTeeMachine>> | { error: string } | null,
) {
  const a = analyzed;
  const statusLine = onchain
    ? "error" in onchain
      ? `status          error: ${onchain.error}`
      : `status          ${onchain.label} (${onchain.status})  [IMachineManager]`
    : null;
  const lines = [
    `source          ${source}`,
    `extension       ${a.extensionId}  (${a.extensionIdHex})`,
    `platform        ${a.platform || "—"}`,
    `chain           ${a.chainLabel} (${a.chainId})`,
    statusLine,
    `tee id          ${a.teeId}`,
    `owner           ${a.initialOwner}`,
    `code hash       ${a.codeHash}`,
    `governance      ${a.governanceHash}`,
    `challenge       ${shortHex(a.challenge, 10, 8)}`,
    `policies        ${a.initialSigningPolicyId} → ${a.lastSigningPolicyId}`,
    `tee time        ${a.teeTimestampIso}`,
    `state version   ${a.stateVersion || "—"}`,
    `attestation     ${a.attestationKind}${a.attestationClaims?.hwmodel ? ` (${a.attestationClaims.hwmodel})` : ""}`,
    `signatures      data ${a.dataSignatureBytes}B · proxy ${a.proxySignatureBytes}B`,
    `keys match      ${a.keysMatch}`,
  ].filter((line) => line != null);
  if (a.attestationClaims?.sub) {
    lines.push(`attestation sub ${String(a.attestationClaims.sub)}`);
  }
  if (a.attestationClaims?.dbgstat) {
    lines.push(`dbgstat         ${String(a.attestationClaims.dbgstat)}`);
  }
  console.log(lines.join("\n"));

  if (onchain && !("error" in onchain)) {
    console.log("\non-chain (IMachineManager)");
    console.log(`  owner         ${onchain.owner}`);
    console.log(`  tee proxy id  ${onchain.machine?.teeProxyId || "—"}`);
    console.log(`  registered    ${onchain.machine?.url || "—"}`);
    console.log(
      `  status since  ${onchain.lastStatusChangeIso || "—"} (${onchain.lastStatusChangeTs || 0})`,
    );
    if (
      onchain.attestation?.initialTeeId &&
      onchain.attestation.initialTeeId !==
        "0x0000000000000000000000000000000000000000"
    ) {
      console.log(`  initial tee   ${onchain.attestation.initialTeeId}`);
    }
    const peers = onchain.activePeers || [];
    if (peers.length) {
      console.log(`  active peers  ${peers.length}`);
      for (const p of peers) {
        const mark =
          p.teeId?.toLowerCase() === onchain.teeId?.toLowerCase() ? " *" : "";
        console.log(`    ${p.teeId}${mark}  ${p.url}`);
      }
    }
  }

  if (a.ledgerState) {
    console.log("\nledger state");
    console.log(JSON.stringify(a.ledgerState, null, 2));
  } else if (a.ledgerStateRaw) {
    console.log("\nledger state (raw)");
    console.log(a.ledgerStateRaw);
  } else {
    console.log("\nledger state    (empty)");
  }
}

async function main() {
  const args = process.argv.slice(2);
  let source: string;
  let json: unknown;

  if (args.includes("--stdin") || args.includes("-")) {
    source = "stdin";
    const text = await readStdin();
    json = JSON.parse(text);
  } else {
    const raw = args[0] || DEFAULT_PROXY_INFO_URL;
    source = normalizeInfoUrl(raw);
    const res = await fetch(source, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const t = (await res.text()).slice(0, 200);
      throw new Error(`proxy ${res.status}: ${t || res.statusText}`);
    }
    json = await res.json();
  }

  const analyzed = analyzeTeeInfo(parseSignedTeeInfo(json));
  let onchain: Awaited<ReturnType<typeof lookupTeeMachine>> | { error: string } | null =
    null;
  try {
    onchain = await lookupTeeMachine({
      chainId: analyzed.chainId,
      teeId: analyzed.teeId,
      extensionId: analyzed.extensionId,
    });
  } catch (e) {
    onchain = { error: e instanceof Error ? e.message : String(e) };
  }
  print(analyzed, source, onchain);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
