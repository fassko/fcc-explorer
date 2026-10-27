import {
  concat,
  hexToBytes,
  hexToString,
  isHex,
  keccak256,
  type Hex,
} from "viem";

export const DEFAULT_PROXY_INFO_URL = "http://35.195.12.247:6662/info";

const CHAIN_LABELS: Record<number, string> = {
  14: "Flare",
  19: "Songbird",
  16: "Coston",
  114: "Coston2",
};

export type PubKey = { x: Hex; y: Hex };

export type SignedTeeInfo = {
  teeInfo: {
    challenge: Hex;
    publicKey: PubKey;
    initialSigningPolicyId: number;
    initialSigningPolicyHash: Hex;
    lastSigningPolicyId: number;
    lastSigningPolicyHash: Hex;
    chainId: number;
    state: {
      systemState: string;
      systemStateVersion: string;
      state: string;
      stateVersion: string;
    };
    teeTimestamp: number;
    machinePathListNonce: number;
    machinePathListHash: string;
  };
  machineData: {
    extensionId: Hex;
    initialOwner: string;
    codeHash: Hex;
    platform: Hex;
    publicKey: PubKey;
    governanceHash: Hex;
  };
  dataSignature: string;
  attestation: string;
  proxySignature: string;
};

export function decodeBytes32String(hex: string): string {
  if (!hex || hex === "0x") return "";
  try {
    return hexToString(hex as Hex, { size: 32 }).replace(/\0+$/, "");
  } catch {
    const bytes = hexToBytes(hex as Hex);
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, end));
  }
}

export function teeAddressFromPublicKey(pk: PubKey): Hex {
  const x = hexToBytes(pk.x);
  const y = hexToBytes(pk.y);
  if (x.length !== 32 || y.length !== 32) {
    throw new Error("public key x and y must be 32 bytes each");
  }
  const hash = keccak256(concat([pk.x, pk.y]));
  return `0x${hash.slice(26)}` as Hex;
}

function sigByteLength(sig: string): number {
  if (!sig || sig === "0x") return 0;
  const h = sig.startsWith("0x") || sig.startsWith("0X") ? sig.slice(2) : sig;
  return h.length / 2;
}

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const pad = "=".repeat((4 - (part.length % 4)) % 4);
    const json = Buffer.from(
      part.replace(/-/g, "+").replace(/_/g, "/") + pad,
      "base64",
    ).toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function decodeAttestationJwt(attestation: string) {
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

function decodeLedgerState(hex: string) {
  if (!hex || hex === "0x") return { raw: "", parsed: null as unknown };
  try {
    const raw = new TextDecoder().decode(hexToBytes(hex as Hex));
    try {
      return { raw, parsed: JSON.parse(raw) as unknown };
    } catch {
      return { raw, parsed: null };
    }
  } catch {
    return { raw: hex, parsed: null };
  }
}

function asHex(v: unknown, field: string): Hex {
  if (typeof v !== "string" || !v.startsWith("0x")) {
    throw new Error(`${field} must be a 0x-hex string`);
  }
  if (!isHex(v)) throw new Error(`${field} must be valid hex`);
  return v;
}

function asPubkey(v: unknown, field: string): PubKey {
  if (!v || typeof v !== "object") throw new Error(`${field} missing`);
  const o = v as Record<string, unknown>;
  return { x: asHex(o.x, `${field}.x`), y: asHex(o.y, `${field}.y`) };
}

export function parseSignedTeeInfo(input: unknown): SignedTeeInfo {
  if (!input || typeof input !== "object") {
    throw new Error("body must be a JSON object");
  }
  const root = input as Record<string, unknown>;
  const teeInfo = root.teeInfo as Record<string, unknown> | undefined;
  const machineData = root.machineData as Record<string, unknown> | undefined;
  if (!teeInfo || !machineData) {
    throw new Error("missing teeInfo or machineData");
  }
  const state = teeInfo.state as Record<string, unknown> | undefined;
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
      governanceHash: asHex(
        machineData.governanceHash,
        "machineData.governanceHash",
      ),
    },
    dataSignature: String(root.dataSignature ?? "0x"),
    attestation: String(root.attestation ?? ""),
    proxySignature: String(root.proxySignature ?? "0x"),
  };
}

export type AnalyzedTeeInfo = ReturnType<typeof analyzeTeeInfo>;

export function analyzeTeeInfo(raw: SignedTeeInfo) {
  const { teeInfo, machineData } = raw;
  const teeId = teeAddressFromPublicKey(machineData.publicKey);
  const ledger = decodeLedgerState(teeInfo.state.state);
  const jwt = decodeAttestationJwt(raw.attestation);

  let attestationKind: "empty" | "jwt" | "string" = "empty";
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

export function normalizeInfoUrl(raw: string): string {
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

export function shortHex(h: string, left = 6, right = 4): string {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (s.length <= left + right) return h.startsWith("0x") ? h : `0x${h}`;
  return `0x${s.slice(0, left)}…${s.slice(-right)}`;
}
