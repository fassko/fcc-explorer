import {
  explorerAddressUrl,
  explorerFetch,
  explorerTxUrl,
  getChain,
  getTeeExtensionInstructionsSender,
} from "./chain.mjs";
import { keccak256 } from "./keccak256.mjs";

const TX_LIMIT = 15;

function parseExtensionId(raw) {
  if (raw == null || raw === "") throw new Error("extensionId is required");
  const s = String(raw).trim();
  try {
    return BigInt(s);
  } catch {
    throw new Error(`invalid extensionId: ${raw}`);
  }
}

function parseChainId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`invalid chainId: ${raw}`);
  return n;
}

function abiInputType(input) {
  if (!input) return "unknown";
  if (input.type === "tuple" || input.type?.startsWith("tuple")) {
    const inner = (input.components || []).map(abiInputType).join(",");
    if (input.type === "tuple[]") return `(${inner})[]`;
    if (input.type?.endsWith("[]")) return `(${inner})[]`;
    return `(${inner})`;
  }
  return input.type || "unknown";
}

function functionSelector(abiFn) {
  const types = (abiFn.inputs || []).map(abiInputType).join(",");
  const sig = `${abiFn.name}(${types})`;
  const hash = keccak256(new TextEncoder().encode(sig));
  return `0x${Array.from(hash.subarray(0, 4), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function buildSelectorMap(abi) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!Array.isArray(abi)) return map;
  for (const e of abi) {
    if (!e || e.type !== "function" || !e.name) continue;
    map.set(functionSelector(e).toLowerCase(), e.name);
  }
  return map;
}

function extractMethods(abi) {
  if (!Array.isArray(abi)) return [];
  return abi
    .filter((e) => e && e.type === "function" && e.name)
    .map((e) => ({
      name: e.name,
      selector: functionSelector(e),
      stateMutability: e.stateMutability || "nonpayable",
      inputs: (e.inputs || []).map((i) => ({
        name: i.name || "",
        type: i.type || "",
      })),
    }));
}

function looksLikeSelector(s) {
  return typeof s === "string" && /^0x[0-9a-fA-F]{8}$/.test(s);
}

function decodeMethodName(item, selectorMap) {
  const types = item?.transaction_types;
  if (
    item?.created_contract ||
    (Array.isArray(types) && types.includes("contract_creation"))
  ) {
    return "contract creation";
  }

  const decodedCall = item?.decoded_input?.method_call;
  if (typeof decodedCall === "string" && decodedCall) {
    const name = decodedCall.split("(")[0]?.trim();
    if (name) return name;
  }

  // Already a human name from the explorer
  if (item?.method && !looksLikeSelector(item.method)) {
    return item.method;
  }

  const raw = item?.raw_input || item?.input || "";
  const fromInput =
    typeof raw === "string" && raw.startsWith("0x") && raw.length >= 10
      ? raw.slice(0, 10).toLowerCase()
      : null;
  const fromMethod = looksLikeSelector(item?.method) ? item.method.toLowerCase() : null;
  const selector = fromInput || fromMethod;

  if (selector && selectorMap.has(selector)) {
    return selectorMap.get(selector);
  }

  return selector || null;
}

function mapTx(item, chainId, selectorMap) {
  const hash = item?.hash || "";
  const from = item?.from?.hash || item?.from || null;
  const to = item?.to?.hash || item?.to || null;
  return {
    hash,
    method: decodeMethodName(item, selectorMap),
    status: item?.status || item?.result || null,
    timestamp: item?.timestamp || null,
    from,
    to,
    value: item?.value ?? null,
    explorerUrl: explorerTxUrl(chainId, hash),
  };
}

async function fetchContractMeta(explorerBase, address) {
  const url = `${explorerBase}/api/v2/smart-contracts/${address}`;
  const res = await explorerFetch(url);
  if (res.status === 404) {
    return { name: null, verified: false, methods: [], abi: null };
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`explorer contract ${res.status}: ${text || res.statusText}`);
  }
  const body = await res.json();
  const abi = Array.isArray(body.abi) ? body.abi : null;
  const verified =
    Boolean(abi?.length) ||
    Boolean(body.is_verified) ||
    Boolean(body.is_fully_verified) ||
    Boolean(body.verified_twin_address_hash);
  return {
    name: body.name || null,
    verified,
    methods: verified ? extractMethods(abi || []) : [],
    abi: verified ? abi : null,
  };
}

async function fetchRecentTxs(explorerBase, address, chainId, selectorMap) {
  const url = `${explorerBase}/api/v2/addresses/${address}/transactions`;
  const res = await explorerFetch(url);
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`explorer txs ${res.status}: ${text || res.statusText}`);
  }
  const body = await res.json();
  const items = Array.isArray(body.items) ? body.items : [];
  return items.slice(0, TX_LIMIT).map((item) => mapTx(item, chainId, selectorMap));
}

/**
 * Resolve InstructionSender for an extension and enrich with explorer ABI + txs.
 * @returns {Promise<object>}
 */
export async function lookupInstructionSender({ extensionId, chainId }) {
  const extId = parseExtensionId(extensionId);
  const cid = parseChainId(chainId);
  const chain = getChain(cid);
  if (!chain) {
    const err = new Error(`unsupported chainId ${cid}`);
    err.code = "UNSUPPORTED_CHAIN";
    throw err;
  }

  const address = await getTeeExtensionInstructionsSender(cid, extId);
  if (!address) {
    return {
      ok: true,
      chainId: cid,
      chainLabel: chain.label,
      address: null,
      name: null,
      verified: false,
      methods: [],
      transactions: [],
      explorerAddressUrl: null,
    };
  }

  let name = null;
  let verified = false;
  let methods = [];
  let transactions = [];
  let explorerError = null;
  let selectorMap = new Map();

  try {
    const meta = await fetchContractMeta(chain.explorer, address);
    name = meta.name;
    verified = meta.verified;
    methods = meta.methods;
    selectorMap = buildSelectorMap(meta.abi);
  } catch (e) {
    explorerError = e.message || String(e);
  }

  try {
    transactions = await fetchRecentTxs(chain.explorer, address, cid, selectorMap);
  } catch (e) {
    explorerError = explorerError
      ? `${explorerError}; ${e.message || String(e)}`
      : e.message || String(e);
  }

  return {
    ok: true,
    chainId: cid,
    chainLabel: chain.label,
    address,
    name,
    verified,
    methods,
    transactions,
    explorerAddressUrl: explorerAddressUrl(cid, address),
    ...(explorerError ? { explorerError } : {}),
  };
}
