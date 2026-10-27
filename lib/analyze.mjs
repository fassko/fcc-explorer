import { keccak256 } from "./keccak256.mjs";

export const DEFAULT_PROXY_INFO_URL = "http://35.195.12.247:6662/info";

const CHAIN_LABELS = {
  14: "Flare",
  19: "Songbird",
  16: "Coston",
  114: "Coston2",
};

function strip0x(hex) {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

function hexToBytes(hex) {
  const h = strip0x(hex);
  if (h.length % 2 !== 0) throw new Error(`odd-length hex: ${hex.slice(0, 18)}…`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b) {
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function decodeBytes32String(hex) {
  if (!hex || hex === "0x") return "";
  const bytes = hexToBytes(hex);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, end));
}

export function teeAddressFromPublicKey(pk) {
  const x = hexToBytes(pk.x);
  const y = hexToBytes(pk.y);
  if (x.length !== 32 || y.length !== 32) {
    throw new Error("public key x and y must be 32 bytes each");
  }
  const raw = new Uint8Array(64);
  raw.set(x, 0);
  raw.set(y, 32);
  return bytesToHex(keccak256(raw).subarray(12));
}

function sigByteLength(sig) {
  if (!sig || sig === "0x") return 0;
  return strip0x(sig).length / 2;
}

function b64urlJson(part) {
  try {
    const pad = "=".repeat((4 - (part.length % 4)) % 4);
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString(
      "utf8",
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function decodeAttestationJwt(attestation) {
  if (!attestation || attestation === "magic_pass") {
    return { header: null, claims: null };
  }
  const parts = attestation.split(".");
  if (parts.length < 2) return { header: null, claims: null };
  return {
    header: b64urlJson(parts[0]),
    claims: b64urlJson(parts[1]),
  };
}

function decodeLedgerState(hex) {
  if (!hex || hex === "0x") return { raw: "", parsed: null };
  try {
    const raw = new TextDecoder().decode(hexToBytes(hex));
    try {
      return { raw, parsed: JSON.parse(raw) };
    } catch {
      return { raw, parsed: null };
    }
  } catch {
    return { raw: hex, parsed: null };
  }
}

function asHex(v, field) {
  if (typeof v !== "string" || !v.startsWith("0x")) {
    throw new Error(`${field} must be a 0x-hex string`);
  }
  return v;
}

function asPubkey(v, field) {
  if (!v || typeof v !== "object") throw new Error(`${field} missing`);
  return { x: asHex(v.x, `${field}.x`), y: asHex(v.y, `${field}.y`) };
}

export function parseSignedTeeInfo(input) {
  if (!input || typeof input !== "object") {
    throw new Error("body must be a JSON object");
  }
  const teeInfo = input.teeInfo;
  const machineData = input.machineData;
  if (!teeInfo || !machineData) {
    throw new Error("missing teeInfo or machineData");
  }
  const state = teeInfo.state;
  if (!state) throw new Error("missing teeInfo.state");

  return {
    teeInfo: {
      challenge: asHex(teeInfo.challenge, "teeInfo.challenge"),
      publicKey: asPubkey(teeInfo.publicKey, "teeInfo.publicKey"),
      initialSigningPolicyId: Number(teeInfo.initialSigningPolicyId),
      initialSigningPolicyHash: asHex(
        teeInfo.initialSigningPolicyHash,
        "teeInfo.initialSigningPolicyHash",
      ),
      lastSigningPolicyId: Number(teeInfo.lastSigningPolicyId),
      lastSigningPolicyHash: asHex(
        teeInfo.lastSigningPolicyHash,
        "teeInfo.lastSigningPolicyHash",
      ),
      chainId: Number(teeInfo.chainId),
      state: {
        systemState: String(state.systemState ?? "0x"),
        systemStateVersion: String(state.systemStateVersion ?? "0x"),
        state: String(state.state ?? "0x"),
        stateVersion: String(state.stateVersion ?? "0x"),
      },
      teeTimestamp: Number(teeInfo.teeTimestamp),
      machinePathListNonce: Number(teeInfo.machinePathListNonce ?? 0),
      machinePathListHash: String(
        teeInfo.machinePathListHash ??
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      ),
    },
    machineData: {
      extensionId: asHex(machineData.extensionId, "machineData.extensionId"),
      initialOwner: String(machineData.initialOwner),
      codeHash: asHex(machineData.codeHash, "machineData.codeHash"),
      platform: asHex(machineData.platform, "machineData.platform"),
      publicKey: asPubkey(machineData.publicKey, "machineData.publicKey"),
      governanceHash: asHex(machineData.governanceHash, "machineData.governanceHash"),
    },
    dataSignature: String(input.dataSignature ?? "0x"),
    attestation: String(input.attestation ?? ""),
    proxySignature: String(input.proxySignature ?? "0x"),
  };
}

export function analyzeTeeInfo(raw) {
  const { teeInfo, machineData } = raw;
  const teeId = teeAddressFromPublicKey(machineData.publicKey);
  const ledger = decodeLedgerState(teeInfo.state.state);
  const jwt = decodeAttestationJwt(raw.attestation);

  let attestationKind = "empty";
  if (raw.attestation && raw.attestation.split(".").length >= 2) {
    attestationKind = "jwt";
  } else if (raw.attestation) {
    attestationKind = "string";
  }

  const keysMatch =
    machineData.publicKey.x.toLowerCase() === teeInfo.publicKey.x.toLowerCase() &&
    machineData.publicKey.y.toLowerCase() === teeInfo.publicKey.y.toLowerCase();

  const ts = teeInfo.teeTimestamp;
  const teeTimestampIso =
    Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : "invalid";

  return {
    extensionId: Number(BigInt(machineData.extensionId)),
    extensionIdHex: machineData.extensionId,
    platform: decodeBytes32String(machineData.platform),
    initialOwner: machineData.initialOwner,
    codeHash: machineData.codeHash,
    governanceHash: machineData.governanceHash,
    teeId,
    publicKey: machineData.publicKey,
    chainId: teeInfo.chainId,
    chainLabel: CHAIN_LABELS[teeInfo.chainId] ?? `chain ${teeInfo.chainId}`,
    challenge: teeInfo.challenge,
    initialSigningPolicyId: teeInfo.initialSigningPolicyId,
    lastSigningPolicyId: teeInfo.lastSigningPolicyId,
    teeTimestamp: ts,
    teeTimestampIso,
    stateVersion: decodeBytes32String(teeInfo.state.stateVersion),
    systemStateHex: teeInfo.state.systemState,
    systemStateVersion: teeInfo.state.systemStateVersion,
    ledgerState: ledger.parsed,
    ledgerStateRaw: ledger.raw,
    dataSignatureBytes: sigByteLength(raw.dataSignature),
    proxySignatureBytes: sigByteLength(raw.proxySignature),
    attestationKind,
    attestationClaims: jwt.claims,
    attestationHeader: jwt.header,
    keysMatch,
    raw,
  };
}

export function normalizeInfoUrl(raw) {
  const u = new URL(String(raw).trim());
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("only http(s) proxy URLs are allowed");
  }
  const path = u.pathname.replace(/\/+$/, "");
  u.pathname = path.endsWith("/info") ? path || "/info" : `${path}/info`;
  u.search = "";
  u.hash = "";
  return u.toString();
}

export function shortHex(h, left = 6, right = 4) {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (s.length <= left + right) return h.startsWith("0x") ? h : `0x${h}`;
  return `0x${s.slice(0, left)}…${s.slice(-right)}`;
}
