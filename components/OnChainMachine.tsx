"use client";

import { type Address, type Hex } from "viem";
import { useReadContract } from "wagmi";
import { iMachineManagerAbi } from "@/lib/abi";
import { CHAINS, IMACHINE_MANAGER_DOCS, TEE_MACHINE_STATUS } from "@/lib/chain";
import { Field } from "@/components/Field";
import {
  addrUrl,
  formatTs,
  proxyBaseUrl,
  shortHex,
  statusBadgeClass,
  urlsMatch,
} from "@/lib/format";
import { decodeBytes32String } from "@/lib/analyze";

const ZERO = "0x0000000000000000000000000000000000000000";

type Props = {
  teeId: Address;
  chainId: number;
  extensionId?: string | number | null;
  source?: string | null;
  initialOwner?: string | null;
};

function useMachineReads(props: Props) {
  const { teeId, chainId, extensionId } = props;
  const chain = CHAINS[chainId];
  const mgr = chain?.flareTeeManager;
  const enabled = Boolean(mgr && teeId);
  const chainIdOpt = chainId as 114 | 16;

  const statusQ = useReadContract({
    address: mgr,
    abi: iMachineManagerAbi,
    functionName: "getTeeMachineStatus",
    args: [teeId],
    chainId: chainIdOpt,
    query: { enabled },
  });
  const ownerQ = useReadContract({
    address: mgr,
    abi: iMachineManagerAbi,
    functionName: "getTeeMachineOwner",
    args: [teeId],
    chainId: chainIdOpt,
    query: { enabled },
  });
  const lastTsQ = useReadContract({
    address: mgr,
    abi: iMachineManagerAbi,
    functionName: "getLastStatusChangeTs",
    args: [teeId],
    chainId: chainIdOpt,
    query: { enabled },
  });
  const machineQ = useReadContract({
    address: mgr,
    abi: iMachineManagerAbi,
    functionName: "getTeeMachine",
    args: [teeId],
    chainId: chainIdOpt,
    query: { enabled },
  });
  const attestationQ = useReadContract({
    address: mgr,
    abi: iMachineManagerAbi,
    functionName: "getTeeMachineWithAttestationData",
    args: [teeId],
    chainId: chainIdOpt,
    query: { enabled },
  });

  const extId =
    extensionId != null && extensionId !== ""
      ? BigInt(String(extensionId))
      : null;

  const peersQ = useReadContract({
    address: mgr,
    abi: iMachineManagerAbi,
    functionName: "getActiveTeeMachines",
    args: extId != null ? [extId] : undefined,
    chainId: chainIdOpt,
    query: { enabled: enabled && extId != null },
  });

  return {
    chain,
    statusQ,
    ownerQ,
    lastTsQ,
    machineQ,
    attestationQ,
    peersQ,
    loading:
      statusQ.isLoading ||
      ownerQ.isLoading ||
      lastTsQ.isLoading ||
      machineQ.isLoading ||
      attestationQ.isLoading,
    error:
      statusQ.error ||
      ownerQ.error ||
      lastTsQ.error ||
      machineQ.error ||
      attestationQ.error,
  };
}

export function MachineStatusBadge(props: Props) {
  const { chain, statusQ, error, loading } = useMachineReads(props);

  if (!chain) {
    return <span className="badge warn">unsupported chain</span>;
  }
  if (error) {
    return (
      <>
        <span className="badge warn">status unavailable</span>
        <span
          className="muted"
          style={{ marginLeft: ".45rem", fontSize: ".78rem" }}
        >
          {error.message}
        </span>
      </>
    );
  }
  if (loading || statusQ.data == null) {
    return (
      <span className="muted" style={{ fontSize: ".78rem" }}>
        Loading status…
      </span>
    );
  }
  const status = Number(statusQ.data);
  const label = TEE_MACHINE_STATUS[status] ?? `UNKNOWN(${status})`;
  return (
    <>
      <span className={`badge ${statusBadgeClass(label)}`}>{label}</span>{" "}
      <a href={IMACHINE_MANAGER_DOCS} target="_blank" rel="noopener noreferrer">
        IMachineManager
      </a>
    </>
  );
}

export function OnChainRegistry(props: Props) {
  const {
    teeId,
    chainId,
    extensionId,
    source,
    initialOwner,
  } = props;
  const {
    chain,
    statusQ,
    ownerQ,
    lastTsQ,
    machineQ,
    attestationQ,
    peersQ,
    loading,
    error,
  } = useMachineReads(props);

  if (!chain) {
    return <p className="lead err-inline">unsupported chain</p>;
  }
  if (error) {
    return <p className="lead err-inline">{error.message}</p>;
  }
  if (loading || statusQ.data == null) {
    return <p className="lead">Loading on-chain registry…</p>;
  }

  const owner = ownerQ.data as Address | undefined;
  const lastTs = Number(lastTsQ.data ?? 0);
  const lastIso = lastTs > 0 ? new Date(lastTs * 1000).toISOString() : null;
  const machine = machineQ.data;
  const attestation = attestationQ.data;
  const registeredUrl = machine?.url || "";
  const fetchedBase = proxyBaseUrl(source);
  const match = urlsMatch(registeredUrl, fetchedBase);
  const ownerChanged =
    owner &&
    initialOwner &&
    owner.toLowerCase() !== String(initialOwner).toLowerCase();
  const initialTeeId = attestation?.initialTeeId;
  const hasInitialTee = initialTeeId && initialTeeId.toLowerCase() !== ZERO;

  const peers: { teeId: Address; url: string }[] = [];
  if (peersQ.data) {
    const [teeIds, urls] = peersQ.data;
    const n = Math.min(teeIds.length, urls.length);
    for (let i = 0; i < n; i++) peers.push({ teeId: teeIds[i], url: urls[i] });
  }

  return (
    <>
      <h3 className="subhead">On-chain registry</h3>
      <div className="grid">
        <Field label="Owner" copy={owner || undefined}>
          {owner ? (
            <>
              <a
                className="mono"
                href={addrUrl(chainId, owner)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortHex(owner, 8, 6)}
              </a>
              {ownerChanged ? (
                <span className="badge warn" style={{ marginLeft: ".4rem" }}>
                  ≠ initial
                </span>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </Field>
        <Field label="TEE proxy id" copy={machine?.teeProxyId}>
          {machine?.teeProxyId ? (
            <a
              className="mono"
              href={addrUrl(chainId, machine.teeProxyId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortHex(machine.teeProxyId, 8, 6)}
            </a>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Registered URL" copy={registeredUrl || undefined}>
          {registeredUrl ? (
            <>
              <span className="mono">{registeredUrl}</span>
              {match === false ? (
                <span className="badge warn" style={{ marginLeft: ".4rem" }}>
                  ≠ fetch URL
                </span>
              ) : match === true ? (
                <span className="badge ok" style={{ marginLeft: ".4rem" }}>
                  matches fetch
                </span>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Last status change" mono>
          {formatTs(lastIso)}
        </Field>
        {hasInitialTee && initialTeeId ? (
          <Field label="Initial TEE id" copy={initialTeeId}>
            <a
              className="mono"
              href={addrUrl(chainId, initialTeeId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortHex(initialTeeId, 8, 6)}
            </a>
          </Field>
        ) : null}
        {attestation?.platform ? (
          <Field label="On-chain platform" mono>
            {decodeBytes32String(attestation.platform as Hex)}
          </Field>
        ) : null}
      </div>

      {peers.length > 0 ? (
        <>
          <h3 className="subhead">
            Active TEEs for extension
            {extensionId != null ? ` ${extensionId}` : ""}
          </h3>
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
                {peers.map((p) => {
                  const self =
                    p.teeId &&
                    teeId &&
                    p.teeId.toLowerCase() === teeId.toLowerCase();
                  return (
                    <tr key={p.teeId}>
                      <td>
                        <a
                          className="mono"
                          href={addrUrl(chainId, p.teeId)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {shortHex(p.teeId, 8, 6)}
                        </a>
                        {self ? (
                          <span
                            className="badge ok"
                            style={{ marginLeft: ".35rem" }}
                          >
                            this
                          </span>
                        ) : null}
                      </td>
                      <td className="mono">{p.url || "—"}</td>
                      <td>
                        {p.url ? (
                          <a
                            href={`${p.url.replace(/\/$/, "")}/info`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            /info
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : extensionId != null ? (
        <>
          <h3 className="subhead">Active TEEs</h3>
          <p className="lead">No PRODUCTION machines for this extension.</p>
        </>
      ) : null}
    </>
  );
}
