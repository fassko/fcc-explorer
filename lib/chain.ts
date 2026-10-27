import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { iExtensionManagerAbi, iMachineManagerAbi } from "./abi";
import { decodeBytes32String } from "./analyze";

const FETCH_TIMEOUT_MS = 20_000;
const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const satisfies Address;

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
] as const;

export const IMACHINE_MANAGER_DOCS =
  "https://dev.flare.network/fcc/reference/IMachineManager";

export type ChainConfig = {
  label: string;
  rpc: string;
  explorer: string;
  flareTeeManager: Address;
};

export const CHAINS: Record<number, ChainConfig> = {
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

export function getChain(chainId: number | string): ChainConfig | null {
  const id = Number(chainId);
  return CHAINS[id] ?? null;
}

export function explorerAddressUrl(
  chainId: number,
  address: string,
): string | null {
  const chain = getChain(chainId);
  if (!chain || !address) return null;
  return `${chain.explorer}/address/${address}`;
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  const chain = getChain(chainId);
  if (!chain || !hash) return null;
  return `${chain.explorer}/tx/${hash}`;
}

export function teeMachineStatusLabel(status: number | bigint): string {
  const n = Number(status);
  if (!Number.isInteger(n) || n < 0) return `UNKNOWN(${status})`;
  return TEE_MACHINE_STATUS[n] ?? `UNKNOWN(${n})`;
}

export function normalizeAddress(hex: string): Address {
  const h = (hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex).toLowerCase();
  if (h.length !== 40 && h.length !== 64) {
    throw new Error(`invalid address hex length: ${h.length}`);
  }
  const addr = h.length === 64 ? h.slice(24) : h;
  return getAddress(`0x${addr}`);
}

export function isZeroAddress(addr: string | null | undefined): boolean {
  if (!addr) return true;
  try {
    return normalizeAddress(addr).toLowerCase() === ZERO_ADDRESS;
  } catch {
    return true;
  }
}

function requireChain(chainId: number | string): ChainConfig & { id: number } {
  const id = Number(chainId);
  const chain = getChain(id);
  if (!chain) {
    throw Object.assign(new Error(`unsupported chainId ${chainId}`), {
      code: "UNSUPPORTED_CHAIN",
    });
  }
  return { ...chain, id };
}

function publicClient(chain: ChainConfig) {
  return createPublicClient({
    transport: http(chain.rpc, { timeout: FETCH_TIMEOUT_MS }),
  });
}

function badInput(message: string) {
  return Object.assign(new Error(message), { code: "BAD_INPUT" });
}

export function parseExtensionId(raw: unknown): bigint {
  const s = String(raw ?? "").trim();
  if (!s) throw badInput("extensionId is required");
  let id: bigint;
  try {
    id = BigInt(s);
  } catch {
    throw badInput(`invalid extensionId: ${raw}`);
  }
  if (id < 0n) throw badInput(`invalid extensionId: ${raw}`);
  return id;
}

export async function getTeeExtensionInstructionsSender(
  chainId: number,
  extensionId: bigint | string | number,
): Promise<Address | null> {
  const chain = requireChain(chainId);
  const client = publicClient(chain);
  const address = await client.readContract({
    address: chain.flareTeeManager,
    abi: iExtensionManagerAbi,
    functionName: "getTeeExtensionInstructionsSender",
    args: [BigInt(extensionId)],
  });
  if (isZeroAddress(address)) return null;
  return address;
}

/**
 * PRODUCTION machines for an extension.
 * @see https://dev.flare.network/fcc/reference/IMachineManager#getactiveteemachines
 */
export async function lookupProductionExtension({
  chainId,
  extensionId,
}: {
  chainId: number | string;
  extensionId: unknown;
}) {
  const cid = Number(chainId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw badInput(`invalid chainId: ${chainId}`);
  }
  const chain = requireChain(cid);
  const id = parseExtensionId(extensionId);
  const client = publicClient(chain);

  const [[teeIds, urls], instructionsSender] = await Promise.all([
    client.readContract({
      address: chain.flareTeeManager,
      abi: iMachineManagerAbi,
      functionName: "getActiveTeeMachines",
      args: [id],
    }),
    getTeeExtensionInstructionsSender(cid, id),
  ]);

  const n = Math.min(teeIds.length, urls.length);
  const machines: { teeId: Address; url: string }[] = [];
  for (let i = 0; i < n; i++) {
    machines.push({ teeId: teeIds[i], url: urls[i] });
  }

  return {
    chainId: cid,
    chainLabel: chain.label,
    extensionId: id.toString(),
    instructionsSender,
    machines,
  };
}

export async function getTeeMachineStatus(chainId: number, teeId: string) {
  const chain = requireChain(chainId);
  const client = publicClient(chain);
  const status = await client.readContract({
    address: chain.flareTeeManager,
    abi: iMachineManagerAbi,
    functionName: "getTeeMachineStatus",
    args: [normalizeAddress(teeId)],
  });
  const n = Number(status);
  return {
    status: n,
    label: teeMachineStatusLabel(n),
    docsUrl: IMACHINE_MANAGER_DOCS,
    flareTeeManager: chain.flareTeeManager,
  };
}

/**
 * Full IMachineManager read for one TEE.
 * @see https://dev.flare.network/fcc/reference/IMachineManager
 */
export async function lookupTeeMachine({
  chainId,
  teeId,
  extensionId,
}: {
  chainId: number | string;
  teeId: string;
  extensionId?: unknown;
}) {
  const chain = requireChain(chainId);
  const id = normalizeAddress(teeId);
  const mgr = chain.flareTeeManager;
  const client = publicClient(chain);

  let extId: bigint | null = null;
  if (extensionId != null && extensionId !== "") {
    try {
      extId = BigInt(String(extensionId));
    } catch {
      throw new Error(`invalid extensionId: ${extensionId}`);
    }
    if (extId < 0n) throw new Error(`invalid extensionId: ${extensionId}`);
  }

  const [status, owner, lastTs, machine, attestation, peers] =
    await Promise.all([
      client.readContract({
        address: mgr,
        abi: iMachineManagerAbi,
        functionName: "getTeeMachineStatus",
        args: [id],
      }),
      client.readContract({
        address: mgr,
        abi: iMachineManagerAbi,
        functionName: "getTeeMachineOwner",
        args: [id],
      }),
      client.readContract({
        address: mgr,
        abi: iMachineManagerAbi,
        functionName: "getLastStatusChangeTs",
        args: [id],
      }),
      client.readContract({
        address: mgr,
        abi: iMachineManagerAbi,
        functionName: "getTeeMachine",
        args: [id],
      }),
      client.readContract({
        address: mgr,
        abi: iMachineManagerAbi,
        functionName: "getTeeMachineWithAttestationData",
        args: [id],
      }),
      extId != null
        ? client.readContract({
            address: mgr,
            abi: iMachineManagerAbi,
            functionName: "getActiveTeeMachines",
            args: [extId],
          })
        : Promise.resolve(null),
    ]);

  const statusN = Number(status);
  const lastStatusChangeTs = Number(lastTs);

  let activePeers: { teeId: Address; url: string }[] = [];
  if (peers) {
    const [teeIds, urls] = peers;
    const n = Math.min(teeIds.length, urls.length);
    for (let i = 0; i < n; i++) {
      activePeers.push({ teeId: teeIds[i], url: urls[i] });
    }
  }

  const platformHex = attestation.platform as Hex;

  return {
    chainId: Number(chainId),
    chainLabel: chain.label,
    teeId: id,
    status: statusN,
    label: teeMachineStatusLabel(statusN),
    docsUrl: IMACHINE_MANAGER_DOCS,
    flareTeeManager: mgr,
    owner,
    lastStatusChangeTs,
    lastStatusChangeIso:
      lastStatusChangeTs > 0
        ? new Date(lastStatusChangeTs * 1000).toISOString()
        : null,
    machine: {
      teeId: machine.teeId,
      teeProxyId: machine.teeProxyId,
      url: machine.url,
    },
    attestation: {
      teeId: attestation.teeId,
      initialTeeId: attestation.initialTeeId,
      url: attestation.url,
      codeHash: attestation.codeHash,
      platform: decodeBytes32String(platformHex),
    },
    extensionId: extId != null ? extId.toString() : null,
    activePeers,
  };
}

export async function explorerFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "fcc-explorer/1.0",
      },
      signal: ctrl.signal,
    });
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; code?: string }; name?: string };
    if (err?.name === "AbortError") {
      throw new Error(`explorer timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    const cause = err?.cause?.message || err?.cause?.code;
    throw new Error(
      cause ? `${err.message}: ${cause}` : err.message || String(err),
    );
  } finally {
    clearTimeout(timer);
  }
}

export function isValidAddress(addr: string): boolean {
  return isAddress(addr);
}
