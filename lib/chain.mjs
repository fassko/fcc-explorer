import { keccak256 } from "./keccak256.mjs";

const FETCH_TIMEOUT_MS = 20_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * IMachineManager.TeeStatus on FlareTeeManager (MachineManagerFacet).
 * @see https://dev.flare.network/fcc/reference/IMachineManager#teestatus
 */
export const TEE_MACHINE_STATUS = [
  "NONE",
  "INITIALIZED",
  "PRODUCTION",
  "SUSPENDED",
  "PAUSED",
  "BANNED",
];

export const IMACHINE_MANAGER_DOCS =
  "https://dev.flare.network/fcc/reference/IMachineManager";

/** @type {Record<number, { label: string, rpc: string, explorer: string, flareTeeManager: string }>} */
export const CHAINS = {
  114: {
    label: "Coston2",
    rpc: "https://coston2-api.flare.network/ext/C/rpc",
    explorer: "https://coston2-explorer.flare.network",
    flareTeeManager: "0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE",
  },
  16: {
    label: "Coston",
    rpc: "https://coston-api.flare.network/ext/C/rpc",
    explorer: "https://coston-explorer.flare.network",
    flareTeeManager: "0xc4885998f5D792ed88C5Af7a3AaCBe333f017658",
  },
};

function functionSelector(sig) {
  const hash = keccak256(new TextEncoder().encode(sig));
  return Array.from(hash.subarray(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}

const SELECTORS = {
  getTeeExtensionInstructionsSender: functionSelector(
    "getTeeExtensionInstructionsSender(uint256)",
  ),
  getTeeMachineStatus: functionSelector("getTeeMachineStatus(address)"),
  getTeeMachineOwner: functionSelector("getTeeMachineOwner(address)"),
  getLastStatusChangeTs: functionSelector("getLastStatusChangeTs(address)"),
  getTeeMachine: functionSelector("getTeeMachine(address)"),
  getTeeMachineWithAttestationData: functionSelector(
    "getTeeMachineWithAttestationData(address)",
  ),
  getActiveTeeMachines: functionSelector("getActiveTeeMachines(uint256)"),
};

export function getChain(chainId) {
  const id = Number(chainId);
  return CHAINS[id] ?? null;
}

export function explorerAddressUrl(chainId, address) {
  const chain = getChain(chainId);
  if (!chain || !address) return null;
  return `${chain.explorer}/address/${address}`;
}

export function explorerTxUrl(chainId, hash) {
  const chain = getChain(chainId);
  if (!chain || !hash) return null;
  return `${chain.explorer}/tx/${hash}`;
}

export function teeMachineStatusLabel(status) {
  const n = Number(status);
  if (!Number.isInteger(n) || n < 0) return `UNKNOWN(${status})`;
  return TEE_MACHINE_STATUS[n] ?? `UNKNOWN(${n})`;
}

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

function decodeBytes32String(hex) {
  if (!hex || hex === "0x") return "";
  const bytes = hexToBytes(hex);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, end));
}

export function normalizeAddress(hex) {
  const h = strip0x(String(hex)).toLowerCase();
  if (h.length !== 40 && h.length !== 64) {
    throw new Error(`invalid address hex length: ${h.length}`);
  }
  const addr = h.length === 64 ? h.slice(24) : h;
  return `0x${addr}`;
}

export function isZeroAddress(addr) {
  return !addr || normalizeAddress(addr) === ZERO_ADDRESS;
}

function padAddress(teeId) {
  return strip0x(normalizeAddress(teeId)).toLowerCase().padStart(64, "0");
}

function padUint(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}

export function encodeGetTeeExtensionInstructionsSender(extensionId) {
  let id;
  try {
    id = BigInt(extensionId);
  } catch {
    throw new Error(`invalid extensionId: ${extensionId}`);
  }
  if (id < 0n) throw new Error(`invalid extensionId: ${extensionId}`);
  return `0x${SELECTORS.getTeeExtensionInstructionsSender}${padUint(id)}`;
}

export function encodeGetTeeMachineStatus(teeId) {
  return `0x${SELECTORS.getTeeMachineStatus}${padAddress(teeId)}`;
}

function encodeGetTeeMachineOwner(teeId) {
  return `0x${SELECTORS.getTeeMachineOwner}${padAddress(teeId)}`;
}

function encodeGetLastStatusChangeTs(teeId) {
  return `0x${SELECTORS.getLastStatusChangeTs}${padAddress(teeId)}`;
}

function encodeGetTeeMachine(teeId) {
  return `0x${SELECTORS.getTeeMachine}${padAddress(teeId)}`;
}

function encodeGetTeeMachineWithAttestationData(teeId) {
  return `0x${SELECTORS.getTeeMachineWithAttestationData}${padAddress(teeId)}`;
}

function encodeGetActiveTeeMachines(extensionId) {
  return `0x${SELECTORS.getActiveTeeMachines}${padUint(extensionId)}`;
}

export function decodeAddressResult(hex) {
  if (!hex || hex === "0x") return ZERO_ADDRESS;
  return normalizeAddress(hex);
}

export function decodeUintResult(hex) {
  if (!hex || hex === "0x") return 0;
  return Number(BigInt(hex));
}

function readWord(hex, i) {
  return hex.slice(i * 64, (i + 1) * 64);
}

function wordToAddr(w) {
  return `0x${w.slice(24)}`;
}

function wordToUint(w) {
  return BigInt(`0x${w || "0"}`);
}

function wordToBytes32(w) {
  return `0x${w}`;
}

/**
 * Dynamic string inside a tuple that starts at word `tupleBase`.
 * `headIndexInTuple` is relative to the tuple head.
 */
function decodeDynamicStringInTuple(hex, tupleBase, headIndexInTuple) {
  const rel = Number(wordToUint(readWord(hex, tupleBase + headIndexInTuple))) / 32;
  const abs = tupleBase + rel;
  const len = Number(wordToUint(readWord(hex, abs)));
  const start = (abs + 1) * 64;
  return Buffer.from(hex.slice(start, start + len * 2), "hex").toString("utf8");
}

function decodeAddressArray(hex, headIndex) {
  const offset = Number(wordToUint(readWord(hex, headIndex))) / 32;
  const len = Number(wordToUint(readWord(hex, offset)));
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(wordToAddr(readWord(hex, offset + 1 + i)));
  }
  return out;
}

function decodeStringArray(hex, headIndex) {
  const offset = Number(wordToUint(readWord(hex, headIndex))) / 32;
  const len = Number(wordToUint(readWord(hex, offset)));
  const out = [];
  for (let i = 0; i < len; i++) {
    const elOff = Number(wordToUint(readWord(hex, offset + 1 + i))) / 32;
    const abs = offset + 1 + elOff;
    const slen = Number(wordToUint(readWord(hex, abs)));
    const start = (abs + 1) * 64;
    out.push(Buffer.from(hex.slice(start, start + slen * 2), "hex").toString("utf8"));
  }
  return out;
}

/**
 * ABI-decode `TeeMachine` returned as a single memory struct
 * (outer offset word, then teeId / teeProxyId / url).
 * @see https://dev.flare.network/fcc/reference/IMachineManager#teemachine
 */
export function decodeTeeMachineResult(hexResult) {
  const hex = strip0x(hexResult);
  if (!hex) {
    return { teeId: ZERO_ADDRESS, teeProxyId: ZERO_ADDRESS, url: "" };
  }
  const tupleBase = Number(wordToUint(readWord(hex, 0))) / 32;
  return {
    teeId: wordToAddr(readWord(hex, tupleBase)),
    teeProxyId: wordToAddr(readWord(hex, tupleBase + 1)),
    url: decodeDynamicStringInTuple(hex, tupleBase, 2),
  };
}

/**
 * ABI-decode `TeeMachineWithAttestationData`.
 * @see https://dev.flare.network/fcc/reference/IMachineManager#teemachinewithattestationdata
 */
export function decodeTeeMachineWithAttestationDataResult(hexResult) {
  const hex = strip0x(hexResult);
  if (!hex) {
    return {
      teeId: ZERO_ADDRESS,
      initialTeeId: ZERO_ADDRESS,
      url: "",
      codeHash: `0x${"0".repeat(64)}`,
      platform: "",
      platformHex: `0x${"0".repeat(64)}`,
    };
  }
  const tupleBase = Number(wordToUint(readWord(hex, 0))) / 32;
  const platformHex = wordToBytes32(readWord(hex, tupleBase + 4));
  return {
    teeId: wordToAddr(readWord(hex, tupleBase)),
    initialTeeId: wordToAddr(readWord(hex, tupleBase + 1)),
    url: decodeDynamicStringInTuple(hex, tupleBase, 2),
    codeHash: wordToBytes32(readWord(hex, tupleBase + 3)),
    platform: decodeBytes32String(platformHex),
    platformHex,
  };
}

/** Decode `(address[] teeIds, string[] urls)`. */
export function decodeActiveTeeMachinesResult(hexResult) {
  const hex = strip0x(hexResult);
  if (!hex) return { teeIds: [], urls: [] };
  return {
    teeIds: decodeAddressArray(hex, 0),
    urls: decodeStringArray(hex, 1),
  };
}

export async function ethCall(rpcUrl, to, data) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200);
      throw new Error(`rpc ${res.status}: ${text || res.statusText}`);
    }
    const body = await res.json();
    if (body.error) {
      throw new Error(body.error.message || JSON.stringify(body.error));
    }
    if (typeof body.result !== "string") {
      throw new Error("rpc response missing result");
    }
    return body.result;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`rpc timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    const cause = e?.cause?.message || e?.cause?.code;
    throw new Error(cause ? `${e.message}: ${cause}` : e.message || String(e));
  } finally {
    clearTimeout(timer);
  }
}

function requireChain(chainId) {
  const chain = getChain(chainId);
  if (!chain) {
    throw Object.assign(new Error(`unsupported chainId ${chainId}`), {
      code: "UNSUPPORTED_CHAIN",
    });
  }
  return chain;
}

export async function getTeeExtensionInstructionsSender(chainId, extensionId) {
  const chain = requireChain(chainId);
  const data = encodeGetTeeExtensionInstructionsSender(extensionId);
  const result = await ethCall(chain.rpc, chain.flareTeeManager, data);
  const address = decodeAddressResult(result);
  if (isZeroAddress(address)) return null;
  return address;
}

/**
 * On-chain IMachineManager.getTeeMachineStatus(address) via eth_call to FlareTeeManager.
 * @see https://dev.flare.network/fcc/reference/IMachineManager#getteemachinestatus
 */
export async function getTeeMachineStatus(chainId, teeId) {
  const chain = requireChain(chainId);
  const data = encodeGetTeeMachineStatus(teeId);
  const result = await ethCall(chain.rpc, chain.flareTeeManager, data);
  const status = decodeUintResult(result);
  return {
    status,
    label: teeMachineStatusLabel(status),
    docsUrl: IMACHINE_MANAGER_DOCS,
    flareTeeManager: chain.flareTeeManager,
  };
}

/**
 * Full IMachineManager read for one TEE: status, owner, settings, attestation
 * snapshot, and active peers for the extension.
 * @see https://dev.flare.network/fcc/reference/IMachineManager
 */
export async function lookupTeeMachine({ chainId, teeId, extensionId }) {
  const chain = requireChain(chainId);
  const id = normalizeAddress(teeId);
  const mgr = chain.flareTeeManager;

  let extId = null;
  if (extensionId != null && extensionId !== "") {
    try {
      extId = BigInt(extensionId);
    } catch {
      throw new Error(`invalid extensionId: ${extensionId}`);
    }
    if (extId < 0n) throw new Error(`invalid extensionId: ${extensionId}`);
  }

  const calls = [
    ethCall(chain.rpc, mgr, encodeGetTeeMachineStatus(id)),
    ethCall(chain.rpc, mgr, encodeGetTeeMachineOwner(id)),
    ethCall(chain.rpc, mgr, encodeGetLastStatusChangeTs(id)),
    ethCall(chain.rpc, mgr, encodeGetTeeMachine(id)),
    ethCall(chain.rpc, mgr, encodeGetTeeMachineWithAttestationData(id)),
  ];
  if (extId != null) {
    calls.push(ethCall(chain.rpc, mgr, encodeGetActiveTeeMachines(extId)));
  }

  const results = await Promise.all(calls);
  const [
    statusHex,
    ownerHex,
    lastTsHex,
    machineHex,
    attestationHex,
    peersHex,
  ] = results;

  const status = decodeUintResult(statusHex);
  const lastStatusChangeTs = decodeUintResult(lastTsHex);
  const machine = decodeTeeMachineResult(machineHex);
  const attestation = decodeTeeMachineWithAttestationDataResult(attestationHex);

  /** @type {{ teeId: string, url: string }[]} */
  let activePeers = [];
  if (peersHex) {
    const decoded = decodeActiveTeeMachinesResult(peersHex);
    const n = Math.min(decoded.teeIds.length, decoded.urls.length);
    for (let i = 0; i < n; i++) {
      activePeers.push({ teeId: decoded.teeIds[i], url: decoded.urls[i] });
    }
  }

  return {
    chainId: Number(chainId),
    chainLabel: chain.label,
    teeId: id,
    status,
    label: teeMachineStatusLabel(status),
    docsUrl: IMACHINE_MANAGER_DOCS,
    flareTeeManager: mgr,
    owner: decodeAddressResult(ownerHex),
    lastStatusChangeTs,
    lastStatusChangeIso:
      lastStatusChangeTs > 0
        ? new Date(lastStatusChangeTs * 1000).toISOString()
        : null,
    machine,
    attestation: {
      teeId: attestation.teeId,
      initialTeeId: attestation.initialTeeId,
      url: attestation.url,
      codeHash: attestation.codeHash,
      platform: attestation.platform,
    },
    extensionId: extId != null ? extId.toString() : null,
    activePeers,
  };
}

export async function explorerFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "fcc-explorer/1.0",
      },
      signal: ctrl.signal,
    });
    return res;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`explorer timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    const cause = e?.cause?.message || e?.cause?.code;
    throw new Error(cause ? `${e.message}: ${cause}` : e.message || String(e));
  } finally {
    clearTimeout(timer);
  }
}
