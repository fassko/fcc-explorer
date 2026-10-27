import {
  type AbiFunction,
  type AbiParameter,
  toFunctionSelector,
} from "viem";
import {
  explorerAddressUrl,
  explorerFetch,
  explorerTxUrl,
  getChain,
  getTeeExtensionInstructionsSender,
} from "./chain";

const TX_LIMIT = 15;

function parseExtensionId(raw: unknown): bigint {
  if (raw == null || raw === "") throw new Error("extensionId is required");
  const s = String(raw).trim();
  try {
    return BigInt(s);
  } catch {
    throw new Error(`invalid extensionId: ${raw}`);
  }
}

function parseChainId(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`invalid chainId: ${raw}`);
  return n;
}

type AbiEntry = {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: { name?: string; type?: string; components?: unknown[] }[];
};

function asAbiFunction(e: AbiEntry): AbiFunction {
  return {
    type: "function",
    name: e.name!,
    stateMutability: (e.stateMutability || "nonpayable") as AbiFunction["stateMutability"],
    inputs: (e.inputs || []) as AbiParameter[],
    outputs: [],
  };
}

function functionSelector(abiFn: AbiEntry): string {
  return toFunctionSelector(asAbiFunction(abiFn));
}

function buildSelectorMap(abi: AbiEntry[] | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(abi)) return map;
  for (const e of abi) {
    if (!e || e.type !== "function" || !e.name) continue;
    map.set(functionSelector(e).toLowerCase(), e.name);
  }
  return map;
}

function extractMethods(abi: AbiEntry[] | null) {
  if (!Array.isArray(abi)) return [];
  return abi
    .filter((e) => e && e.type === "function" && e.name)
    .map((e) => ({
      name: e.name!,
      selector: functionSelector(e),
      stateMutability: e.stateMutability || "nonpayable",
      inputs: (e.inputs || []).map((i) => ({
        name: i.name || "",
        type: i.type || "",
      })),
    }));
}

function looksLikeSelector(s: unknown): s is string {
  return typeof s === "string" && /^0x[0-9a-fA-F]{8}$/.test(s);
}

function decodeMethodName(
  item: Record<string, unknown>,
  selectorMap: Map<string, string>,
): string | null {
  const types = item?.transaction_types;
  if (
    item?.created_contract ||
    (Array.isArray(types) && types.includes("contract_creation"))
  ) {
    return "contract creation";
  }

  const decoded = item?.decoded_input as { method_call?: string } | undefined;
  const decodedCall = decoded?.method_call;
  if (typeof decodedCall === "string" && decodedCall) {
    const name = decodedCall.split("(")[0]?.trim();
    if (name) return name;
  }

  if (item?.method && !looksLikeSelector(item.method)) {
    return String(item.method);
  }

  const raw = (item?.raw_input || item?.input || "") as string;
  const fromInput =
    typeof raw === "string" && raw.startsWith("0x") && raw.length >= 10
      ? raw.slice(0, 10).toLowerCase()
      : null;
  const fromMethod = looksLikeSelector(item?.method)
    ? String(item.method).toLowerCase()
    : null;
  const selector = fromInput || fromMethod;

  if (selector && selectorMap.has(selector)) {
    return selectorMap.get(selector)!;
  }

  return selector || null;
}

function mapTx(
  item: Record<string, unknown>,
  chainId: number,
  selectorMap: Map<string, string>,
) {
  const hash = String(item?.hash || "");
  const fromObj = item?.from as { hash?: string } | string | undefined;
  const toObj = item?.to as { hash?: string } | string | undefined;
  const from =
    typeof fromObj === "object" && fromObj ? fromObj.hash || null : fromObj || null;
  const to =
    typeof toObj === "object" && toObj ? toObj.hash || null : toObj || null;
  return {
    hash,
    method: decodeMethodName(item, selectorMap),
    status: (item?.status || item?.result || null) as string | null,
    timestamp: (item?.timestamp || null) as string | null,
    from,
    to,
    value: item?.value ?? null,
    explorerUrl: explorerTxUrl(chainId, hash),
  };
}

async function fetchContractMeta(explorerBase: string, address: string) {
  const url = `${explorerBase}/api/v2/smart-contracts/${address}`;
  const res = await explorerFetch(url);
  if (res.status === 404) {
    return { name: null, verified: false, methods: [] as ReturnType<typeof extractMethods>, abi: null as AbiEntry[] | null };
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`explorer contract ${res.status}: ${text || res.statusText}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const abi = Array.isArray(body.abi) ? (body.abi as AbiEntry[]) : null;
  const verified =
    Boolean(abi?.length) ||
    Boolean(body.is_verified) ||
    Boolean(body.is_fully_verified) ||
    Boolean(body.verified_twin_address_hash);
  return {
    name: (body.name as string) || null,
    verified,
    methods: verified ? extractMethods(abi || []) : [],
    abi: verified ? abi : null,
  };
}

async function fetchRecentTxs(
  explorerBase: string,
  address: string,
  chainId: number,
  selectorMap: Map<string, string>,
) {
  const url = `${explorerBase}/api/v2/addresses/${address}/transactions`;
  const res = await explorerFetch(url);
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`explorer txs ${res.status}: ${text || res.statusText}`);
  }
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  const items = Array.isArray(body.items) ? body.items : [];
  return items.slice(0, TX_LIMIT).map((item) => mapTx(item, chainId, selectorMap));
}

export async function lookupInstructionSender({
  extensionId,
  chainId,
}: {
  extensionId: unknown;
  chainId: unknown;
}) {
  const extId = parseExtensionId(extensionId);
  const cid = parseChainId(chainId);
  const chain = getChain(cid);
  if (!chain) {
    throw Object.assign(new Error(`unsupported chainId ${cid}`), {
      code: "UNSUPPORTED_CHAIN",
    });
  }

  const address = await getTeeExtensionInstructionsSender(cid, extId);
  if (!address) {
    return {
      ok: true as const,
      chainId: cid,
      chainLabel: chain.label,
      address: null,
      name: null,
      verified: false,
      methods: [] as ReturnType<typeof extractMethods>,
      transactions: [] as ReturnType<typeof mapTx>[],
      explorerAddressUrl: null as string | null,
    };
  }

  let name: string | null = null;
  let verified = false;
  let methods: ReturnType<typeof extractMethods> = [];
  let transactions: ReturnType<typeof mapTx>[] = [];
  let explorerError: string | null = null;
  let selectorMap = new Map<string, string>();

  try {
    const meta = await fetchContractMeta(chain.explorer, address);
    name = meta.name;
    verified = meta.verified;
    methods = meta.methods;
    selectorMap = buildSelectorMap(meta.abi);
  } catch (e) {
    explorerError = e instanceof Error ? e.message : String(e);
  }

  try {
    transactions = await fetchRecentTxs(
      chain.explorer,
      address,
      cid,
      selectorMap,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    explorerError = explorerError ? `${explorerError}; ${msg}` : msg;
  }

  return {
    ok: true as const,
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
