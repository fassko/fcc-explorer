const EXPLORERS = {
  114: "https://coston2-explorer.flare.network",
  16: "https://coston-explorer.flare.network",
  19: "https://songbird-explorer.flare.network",
  14: "https://flare-explorer.flare.network",
};

const $ = (id) => document.getElementById(id);

const modeExtension = $("mode-extension");
const modeFetch = $("mode-fetch");
const modePaste = $("mode-paste");
const extensionBox = $("extension-box");
const fetchBox = $("fetch-box");
const pasteBox = $("paste-box");
const extensionInput = $("extension-id");
const chainSelect = $("chain");
const urlInput = $("url");
const pasteInput = $("paste");
const errEl = $("error");
const results = $("results");
const btnExtension = $("find-extension");
const btnFetch = $("analyze-fetch");
const btnPaste = $("analyze-paste");

function explorerBase(chainId) {
  return EXPLORERS[Number(chainId)] || EXPLORERS[114];
}

function shortHex(h, left = 6, right = 4) {
  const s = String(h).startsWith("0x") ? String(h).slice(2) : String(h);
  if (s.length <= left + right) return String(h).startsWith("0x") ? h : `0x${h}`;
  return `0x${s.slice(0, left)}…${s.slice(-right)}`;
}

function addrUrl(chainId, a) {
  return `${explorerBase(chainId)}/address/${a}`;
}

function showError(msg) {
  if (!msg) {
    errEl.classList.add("hidden");
    errEl.textContent = "";
    return;
  }
  errEl.textContent = msg;
  errEl.classList.remove("hidden");
}

function setMode(mode) {
  const boxes = [
    ["extension", modeExtension, extensionBox],
    ["fetch", modeFetch, fetchBox],
    ["paste", modePaste, pasteBox],
  ];
  for (const [name, btn, box] of boxes) {
    const on = mode === name;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    box.classList.toggle("hidden", !on);
  }
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const prev = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => {
      btn.textContent = prev;
    }, 1100);
  } catch {
    /* ignore */
  }
}

function field(label, valueHtml, { mono = false, copy } = {}) {
  const copyBtn = copy
    ? `<button type="button" class="tiny copy" data-copy="${encodeURIComponent(copy)}">Copy</button>`
    : "";
  return `<div class="stat"><label>${label}</label><strong class="${mono ? "mono" : ""}">${valueHtml}</strong>${copyBtn ? `<div style="margin-top:.35rem">${copyBtn}</div>` : ""}</div>`;
}

function claimRows(claims) {
  const prefer = [
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
  const shown = new Set(prefer);
  const keys = [
    ...prefer.filter((k) => k in claims),
    ...Object.keys(claims)
      .filter((k) => !shown.has(k))
      .sort(),
  ];
  return keys
    .map((k) => {
      const v = claims[k];
      const text =
        typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : JSON.stringify(v);
      return `<tr><td>${k}</td><td>${escapeHtml(text)}</td></tr>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMethodSig(m) {
  const args = (m.inputs || [])
    .map((i) => (i.name ? `${i.type} ${i.name}` : i.type))
    .join(", ");
  return `${m.name}(${args})`;
}

const METHOD_GROUPS = [
  {
    key: "payable",
    title: "Payable",
    hint: "Send instructions (pay fee)",
    match: (m) => m.stateMutability === "payable",
  },
  {
    key: "write",
    title: "Write",
    hint: "State-changing, no value",
    match: (m) => m.stateMutability === "nonpayable",
  },
  {
    key: "read",
    title: "Read",
    hint: "View / pure",
    match: (m) => m.stateMutability === "view" || m.stateMutability === "pure",
  },
];

function renderMethodsGrouped(methods) {
  const unused = new Set(methods);
  const sections = METHOD_GROUPS.map((g) => {
    const list = methods
      .filter(g.match)
      .sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((m) => unused.delete(m));
    if (!list.length) return "";
    return `<div class="method-group" data-kind="${g.key}">
      <div class="method-group-head">
        <h4>${escapeHtml(g.title)}</h4>
        <span class="muted">${escapeHtml(g.hint)} · ${list.length}</span>
      </div>
      <ul class="method-list">
        ${list.map((m) => `<li class="mono">${escapeHtml(formatMethodSig(m))}</li>`).join("")}
      </ul>
    </div>`;
  }).join("");

  const other = [...unused].sort((a, b) => a.name.localeCompare(b.name));
  const otherBlock = other.length
    ? `<div class="method-group" data-kind="other">
        <div class="method-group-head">
          <h4>Other</h4>
          <span class="muted">${other.length}</span>
        </div>
        <ul class="method-list">
          ${other
            .map(
              (m) =>
                `<li class="mono"><span class="muted">${escapeHtml(m.stateMutability || "?")}</span> ${escapeHtml(formatMethodSig(m))}</li>`,
            )
            .join("")}
        </ul>
      </div>`
    : "";

  return `<h3 class="subhead">Available methods</h3>
    <div class="method-groups">${sections}${otherBlock}</div>`;
}

function formatTs(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
  } catch {
    return String(iso);
  }
}

function senderPanelLoading() {
  return `<section class="panel" id="sender-panel">
      <h2>Instruction sender</h2>
      <p class="lead">Looking up registry + explorer…</p>
    </section>`;
}

function renderSenderPanel(body) {
  const panel = $("sender-panel");
  if (!panel) return;

  if (!body?.ok) {
    panel.innerHTML = `
      <h2>Instruction sender</h2>
      <p class="lead err-inline">${escapeHtml(body?.error || "lookup failed")}</p>`;
    return;
  }

  if (!body.address) {
    panel.innerHTML = `
      <h2>Instruction sender</h2>
      <p class="lead">No instructions sender registered for this extension.</p>`;
    return;
  }

  const badge = body.verified
    ? `<span class="badge ok">verified</span>`
    : `<span class="badge warn">unverified</span>`;
  const nameBit = body.name ? escapeHtml(body.name) : "Contract";
  const addrLink = body.explorerAddressUrl || "#";

  const methodsBlock =
    body.verified && body.methods?.length
      ? renderMethodsGrouped(body.methods)
      : body.verified
        ? `<p class="lead">Verified, but no ABI functions found.</p>`
        : `<p class="lead">ABI methods are shown only when the contract is verified on the explorer.</p>`;

  const selectorToName = new Map(
    (body.methods || [])
      .filter((m) => m.selector && m.name)
      .map((m) => [String(m.selector).toLowerCase(), m.name]),
  );

  function displayMethod(raw) {
    if (!raw) return "—";
    const s = String(raw);
    if (/^0x[0-9a-fA-F]{8}$/.test(s) && selectorToName.has(s.toLowerCase())) {
      return selectorToName.get(s.toLowerCase());
    }
    return s;
  }

  const txs = body.transactions || [];
  const txsBlock =
    txs.length > 0
      ? `<h3 class="subhead">Recent transactions</h3>
      <div class="table-wrap data-table">
        <table>
          <thead><tr><th>When</th><th>Method</th><th>Status</th><th>Tx</th></tr></thead>
          <tbody>
            ${txs
              .map((t) => {
                const hash = t.hash || "";
                const href = t.explorerUrl || "#";
                return `<tr>
                  <td class="mono muted">${escapeHtml(formatTs(t.timestamp))}</td>
                  <td class="mono">${escapeHtml(displayMethod(t.method))}</td>
                  <td class="mono">${escapeHtml(t.status || "—")}</td>
                  <td><a class="mono" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortHex(hash, 8, 6))}</a></td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`
      : `<h3 class="subhead">Recent transactions</h3><p class="lead">No recent transactions.</p>`;

  const explorerNote = body.explorerError
    ? `<p class="lead err-inline">Explorer: ${escapeHtml(body.explorerError)}</p>`
    : "";

  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>Instruction sender</h2>
        <p class="lead" style="margin:0.25rem 0 0">
          ${nameBit} · ${badge}
          ${body.chainLabel ? ` · ${escapeHtml(body.chainLabel)}` : ""}
        </p>
      </div>
    </div>
    <div class="grid" style="margin-top:.65rem">
      ${field(
        "Address",
        `<a class="mono" href="${escapeHtml(addrLink)}" target="_blank" rel="noopener noreferrer">${shortHex(body.address, 8, 6)}</a>`,
        { copy: body.address },
      )}
    </div>
    ${explorerNote}
    ${methodsBlock}
    ${txsBlock}`;

  panel.querySelectorAll("button.copy").forEach((btn) => {
    btn.addEventListener("click", () =>
      copyText(decodeURIComponent(btn.dataset.copy || ""), btn),
    );
  });
}

async function loadInstructionSender(extensionId, chainId) {
  try {
    const q = new URLSearchParams({
      extensionId: String(extensionId),
      chainId: String(chainId),
    });
    const res = await fetch(`/api/instruction-sender?${q}`);
    const body = await res.json();
    renderSenderPanel(body);
  } catch (e) {
    renderSenderPanel({ ok: false, error: e.message || String(e) });
  }
}

function statusBadgeClass(label) {
  if (label === "PRODUCTION") return "ok";
  if (label === "INITIALIZED" || label === "SUSPENDED") return "warn";
  return "err";
}

/** Strip trailing /info so we can compare fetch source ↔ registered proxy URL. */
function proxyBaseUrl(raw) {
  if (!raw || raw === "paste") return null;
  try {
    const u = new URL(String(raw).trim());
    u.pathname = u.pathname.replace(/\/+$/, "").replace(/\/info$/i, "") || "/";
    if (u.pathname === "/") u.pathname = "";
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function urlsMatch(a, b) {
  if (!a || !b) return null;
  const norm = (s) => String(s).trim().replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

function renderMachineStatus(body, { chainId, source, initialOwner } = {}) {
  const el = $("machine-status");
  const onchain = $("onchain-machine");
  if (!el) return;

  if (!body?.ok) {
    el.innerHTML = `<span class="badge warn">status unavailable</span>
      <span class="muted" style="margin-left:.45rem;font-size:.78rem">${escapeHtml(body?.error || "lookup failed")}</span>`;
    if (onchain) {
      onchain.innerHTML = `<p class="lead err-inline">${escapeHtml(body?.error || "on-chain lookup failed")}</p>`;
    }
    return;
  }

  const cls = statusBadgeClass(body.label);
  const docs = body.docsUrl
    ? ` <a href="${escapeHtml(body.docsUrl)}" target="_blank" rel="noopener noreferrer">IMachineManager</a>`
    : "";
  el.innerHTML = `<span class="badge ${cls}">${escapeHtml(body.label)}</span>${docs}`;

  if (!onchain) return;

  const m = body.machine || {};
  const att = body.attestation || {};
  const owner = body.owner || "";
  const registeredUrl = m.url || "";
  const fetchedBase = proxyBaseUrl(source);
  const match = urlsMatch(registeredUrl, fetchedBase);
  const ownerChanged =
    owner &&
    initialOwner &&
    owner.toLowerCase() !== String(initialOwner).toLowerCase();
  const hasInitialTee =
    att.initialTeeId &&
    att.initialTeeId !== "0x0000000000000000000000000000000000000000";

  const urlNote =
    match === false
      ? `<span class="badge warn" style="margin-left:.4rem">≠ fetch URL</span>`
      : match === true
        ? `<span class="badge ok" style="margin-left:.4rem">matches fetch</span>`
        : "";

  const peers = Array.isArray(body.activePeers) ? body.activePeers : [];
  const peersBlock =
    peers.length > 0
      ? `<h3 class="subhead">Active TEEs for extension${
          body.extensionId != null ? ` ${escapeHtml(String(body.extensionId))}` : ""
        }</h3>
      <div class="table-wrap data-table">
        <table>
          <thead><tr><th>TEE id</th><th>Registered URL</th><th></th></tr></thead>
          <tbody>
            ${peers
              .map((p) => {
                const self =
                  p.teeId &&
                  body.teeId &&
                  p.teeId.toLowerCase() === body.teeId.toLowerCase();
                return `<tr>
                  <td>
                    <a class="mono" href="${escapeHtml(addrUrl(chainId, p.teeId))}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortHex(p.teeId, 8, 6))}</a>
                    ${self ? `<span class="badge ok" style="margin-left:.35rem">this</span>` : ""}
                  </td>
                  <td class="mono">${escapeHtml(p.url || "—")}</td>
                  <td>${
                    p.url
                      ? `<a href="${escapeHtml(p.url.replace(/\/$/, "") + "/info")}" target="_blank" rel="noopener noreferrer">/info</a>`
                      : ""
                  }</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`
      : body.extensionId != null
        ? `<h3 class="subhead">Active TEEs</h3><p class="lead">No PRODUCTION machines for this extension.</p>`
        : "";

  onchain.innerHTML = `
    <h3 class="subhead">On-chain registry</h3>
    <div class="grid">
      ${field(
        "Owner",
        owner
          ? `<a class="mono" href="${escapeHtml(addrUrl(chainId, owner))}" target="_blank" rel="noopener noreferrer">${shortHex(owner, 8, 6)}</a>${
              ownerChanged
                ? `<span class="badge warn" style="margin-left:.4rem">≠ initial</span>`
                : ""
            }`
          : "—",
        { copy: owner || undefined },
      )}
      ${field(
        "TEE proxy id",
        m.teeProxyId
          ? `<a class="mono" href="${escapeHtml(addrUrl(chainId, m.teeProxyId))}" target="_blank" rel="noopener noreferrer">${shortHex(m.teeProxyId, 8, 6)}</a>`
          : "—",
        { copy: m.teeProxyId || undefined },
      )}
      ${field(
        "Registered URL",
        registeredUrl
          ? `<span class="mono">${escapeHtml(registeredUrl)}</span>${urlNote}`
          : "—",
        { copy: registeredUrl || undefined },
      )}
      ${field(
        "Last status change",
        escapeHtml(formatTs(body.lastStatusChangeIso) || "—"),
        { mono: true },
      )}
      ${
        hasInitialTee
          ? field(
              "Initial TEE id",
              `<a class="mono" href="${escapeHtml(addrUrl(chainId, att.initialTeeId))}" target="_blank" rel="noopener noreferrer">${shortHex(att.initialTeeId, 8, 6)}</a>`,
              { copy: att.initialTeeId },
            )
          : ""
      }
    </div>
    ${peersBlock}`;

  onchain.querySelectorAll("button.copy").forEach((btn) => {
    btn.addEventListener("click", () =>
      copyText(decodeURIComponent(btn.dataset.copy || ""), btn),
    );
  });
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      res.ok
        ? `invalid JSON response`
        : `HTTP ${res.status}: ${text.slice(0, 120) || res.statusText}`,
    );
  }
}

async function loadMachineStatus(teeId, chainId, extensionId, ctx = {}) {
  try {
    const q = new URLSearchParams({
      teeId: String(teeId),
      chainId: String(chainId),
    });
    if (extensionId != null && extensionId !== "") {
      q.set("extensionId", String(extensionId));
    }
    const res = await fetch(`/api/machine-status?${q}`);
    const body = await readJson(res);
    if (!res.ok && !body?.ok) {
      renderMachineStatus(
        { ok: false, error: body?.error || `HTTP ${res.status}` },
        { chainId, ...ctx },
      );
      return;
    }
    renderMachineStatus(body, { chainId, ...ctx });
  } catch (e) {
    renderMachineStatus(
      { ok: false, error: e.message || String(e) },
      { chainId, ...ctx },
    );
  }
}

function productionNote(data) {
  if (!data.machines?.length) return "";
  const n = data.machines.length;
  const which =
    n === 1
      ? "1 PRODUCTION machine"
      : `${n} PRODUCTION machines`;
  const picks =
    n > 1
      ? `<div class="modes" role="tablist" style="margin:0.55rem 0 0">
          ${data.machines
            .map((m, i) => {
              const on = i === data.selected;
              return `<button type="button" class="mode prod-pick" data-index="${i}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(shortHex(m.teeId, 6, 4))}</button>`;
            })
            .join("")}
        </div>`
      : "";
  return `<p class="lead" style="margin:0 0 0.85rem">
      ${escapeHtml(which)} for extension
      <span class="mono">${escapeHtml(String(data.extensionId))}</span>
      on ${escapeHtml(data.chainLabel || "")}.
    </p>${picks}`;
}

function bindProductionPicks(root) {
  root.querySelectorAll("button.prod-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      if (Number.isInteger(index)) findExtension(index);
    });
  });
}

function renderExtensionMiss(body) {
  const registered = Boolean(body.instructionsSender);
  const machines = Array.isArray(body.machines) ? body.machines : [];
  const chainId = body.chainId;
  const lead = body.fetchError
    ? `The registry lists a PRODUCTION machine, but its proxy did not return /info.`
    : registered
      ? `Registered on ${body.chainLabel}, with no machine in PRODUCTION.`
      : `No extension ${body.extensionId} is registered on ${body.chainLabel}.`;

  const machineRows = machines
    .map(
      (m) => `<tr>
        <td><a class="mono" href="${escapeHtml(addrUrl(chainId, m.teeId))}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortHex(m.teeId, 8, 6))}</a></td>
        <td class="mono">${escapeHtml(m.url || "—")}</td>
        <td>${
          m.url
            ? `<a href="${escapeHtml(String(m.url).replace(/\/$/, "") + "/info")}" target="_blank" rel="noopener noreferrer">/info</a>`
            : ""
        }</td>
      </tr>`,
    )
    .join("");

  results.innerHTML = `
    <section class="panel">
      <h2>Extension ${escapeHtml(String(body.extensionId))}</h2>
      ${productionNote(body)}
      <p class="lead">${escapeHtml(lead)}</p>
      ${
        body.fetchError
          ? `<p class="lead err-inline">${escapeHtml(body.fetchError)}</p>`
          : ""
      }
      ${
        machines.length
          ? `<div class="table-wrap data-table">
              <table>
                <thead><tr><th>TEE id</th><th>Registered URL</th><th></th></tr></thead>
                <tbody>${machineRows}</tbody>
              </table>
            </div>`
          : ""
      }
    </section>
    ${registered ? senderPanelLoading() : ""}
  `;
  results.classList.remove("hidden");
  bindProductionPicks(results);
  if (registered) loadInstructionSender(body.extensionId, body.chainId);
}

function render(data) {
  const a = data.analyzed;
  const ledger = a.ledgerState;
  const claims = a.attestationClaims;
  const chainId = a.chainId;

  const ledgerBlock = ledger
    ? `<div class="grid">
        ${field("Users", escapeHtml(String(ledger.userCount ?? "—")))}
        ${field("Virtual settlement RLUSD", escapeHtml(String(ledger.virtualSettlementRlusd ?? "—")), { mono: true })}
        ${field("Processed txs", escapeHtml(String(ledger.processedTxCount ?? "—")))}
        ${
          ledger.pendingSettleNonce
            ? field("Pending settle nonce", escapeHtml(ledger.pendingSettleNonce), { mono: true })
            : ""
        }
        ${
          ledger.pendingSettleRlusd
            ? field("Pending settle RLUSD", escapeHtml(ledger.pendingSettleRlusd), { mono: true })
            : ""
        }
      </div>
      <pre>${escapeHtml(JSON.stringify(ledger, null, 2))}</pre>`
    : `<p class="lead">${
        a.ledgerStateRaw
          ? "State is not JSON — showing raw below."
          : "Empty state (0x)."
      }</p>${a.ledgerStateRaw ? `<pre>${escapeHtml(a.ledgerStateRaw)}</pre>` : ""}`;

  const queriedId = data.extensionId != null ? String(data.extensionId) : null;
  const idMismatch =
    queriedId != null && String(a.extensionId) !== queriedId
      ? `<span class="badge warn" style="margin-left:.4rem">proxy extension ≠ ${escapeHtml(queriedId)}</span>`
      : "";
  const registryTee = data.machines?.[data.selected]?.teeId;
  const teeMismatch =
    registryTee && a.teeId && registryTee.toLowerCase() !== String(a.teeId).toLowerCase();

  results.innerHTML = `
    <section class="panel">
      ${productionNote(data)}
      <div class="panel-head">
        <div>
          <h2>Machine</h2>
          <p class="lead" style="margin:0.25rem 0 0">
            Source <span class="mono">${escapeHtml(data.source)}</span>
            ${idMismatch}
            ${
              teeMismatch
                ? `<span class="badge warn" style="margin-left:.4rem">proxy TEE ≠ registry</span>`
                : ""
            }
            ${
              a.keysMatch
                ? ""
                : '<span class="badge warn" style="margin-left:.4rem">teeInfo / machineData keys differ</span>'
            }
          </p>
        </div>
        <div id="machine-status"><span class="muted" style="font-size:.78rem">Loading status…</span></div>
      </div>
      <div class="grid">
        ${field("Extension ID", escapeHtml(String(a.extensionId)), { mono: true, copy: String(a.extensionId) })}
        ${field("Platform", escapeHtml(a.platform || "—"), { mono: true })}
        ${field("Chain", escapeHtml(`${a.chainLabel} (${a.chainId})`), { mono: true })}
        ${field("State version", escapeHtml(a.stateVersion || "—"), { mono: true })}
        ${field(
          "TEE id",
          `<a class="mono" href="${addrUrl(chainId, a.teeId)}" target="_blank" rel="noopener noreferrer">${shortHex(a.teeId, 8, 6)}</a>`,
          { copy: a.teeId },
        )}
        ${field(
          "Initial owner",
          `<a class="mono" href="${addrUrl(chainId, a.initialOwner)}" target="_blank" rel="noopener noreferrer">${shortHex(a.initialOwner, 8, 6)}</a>`,
          { copy: a.initialOwner },
        )}
        ${field("Signing policies", escapeHtml(`${a.initialSigningPolicyId} → ${a.lastSigningPolicyId}`), { mono: true })}
        ${field("TEE timestamp", escapeHtml(a.teeTimestampIso), { mono: true })}
      </div>
      <div class="grid" style="margin-top:.65rem">
        ${field("Code hash", escapeHtml(shortHex(a.codeHash, 10, 8)), { mono: true, copy: a.codeHash })}
        ${field("Governance hash", escapeHtml(shortHex(a.governanceHash, 10, 8)), { mono: true, copy: a.governanceHash })}
        ${field("Challenge", escapeHtml(shortHex(a.challenge, 10, 8)), { mono: true, copy: a.challenge })}
        ${field("Signatures", escapeHtml(`data ${a.dataSignatureBytes}B · proxy ${a.proxySignatureBytes}B`))}
      </div>
      <div id="onchain-machine" style="margin-top:1rem">
        <p class="lead">Loading on-chain registry…</p>
      </div>
    </section>

    ${senderPanelLoading()}

    <section class="panel">
      <h2>Ledger state</h2>
      <p class="lead">Decoded from <span class="mono">teeInfo.state.state</span> (hex → UTF-8 JSON).</p>
      ${ledgerBlock}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Attestation</h2>
          <p class="lead" style="margin:0.25rem 0 0">
            Kind: <span class="mono">${escapeHtml(a.attestationKind)}</span>
            ${a.attestationClaims?.hwmodel ? ` · ${escapeHtml(String(a.attestationClaims.hwmodel))}` : ""}
            ${a.attestationClaims?.dbgstat ? ` · dbgstat=${escapeHtml(String(a.attestationClaims.dbgstat))}` : ""}
          </p>
        </div>
        ${
          claims
            ? `<button type="button" class="btn ghost" id="toggle-claims">Show claims</button>`
            : ""
        }
      </div>
      ${
        claims
          ? `<div id="claims" class="table-wrap hidden"><table><tbody>${claimRows(claims)}</tbody></table></div>`
          : ""
      }
      ${
        a.attestationKind === "string"
          ? `<pre>${escapeHtml(a.raw.attestation.slice(0, 400))}${a.raw.attestation.length > 400 ? "…" : ""}</pre>`
          : ""
      }
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Raw JSON</h2>
        <div class="row">
          <button type="button" class="tiny" id="copy-full">Copy full</button>
          <button type="button" class="tiny" id="copy-sans">Copy sans attestation</button>
          <button type="button" class="btn ghost" id="toggle-raw">Show</button>
        </div>
      </div>
      <pre id="raw" class="hidden"></pre>
      <p class="lead" style="margin-top:.75rem;margin-bottom:0">
        Explorer:
        <a href="${explorerBase(chainId)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.chainLabel || "flare.network")}</a>
        ${
          data.source && data.source !== "paste"
            ? `· Live proxy <a href="${escapeHtml(data.source)}" target="_blank" rel="noopener noreferrer">/info</a>`
            : ""
        }
      </p>
    </section>
  `;

  results.classList.remove("hidden");
  results.dataset.raw = JSON.stringify(a.raw);
  results.dataset.rawSans = JSON.stringify({ ...a.raw, attestation: "[omitted]" });

  const claimsEl = $("claims");
  const toggleClaims = $("toggle-claims");
  if (toggleClaims && claimsEl) {
    toggleClaims.addEventListener("click", () => {
      const open = !claimsEl.classList.contains("hidden");
      claimsEl.classList.toggle("hidden", open);
      toggleClaims.textContent = open ? "Show claims" : "Hide claims";
    });
  }

  const rawEl = $("raw");
  const toggleRaw = $("toggle-raw");
  toggleRaw?.addEventListener("click", () => {
    const open = !rawEl.classList.contains("hidden");
    if (!open) {
      rawEl.textContent = JSON.stringify(
        { ...a.raw, attestation: "[omitted — use Copy full]" },
        null,
        2,
      );
    }
    rawEl.classList.toggle("hidden", open);
    toggleRaw.textContent = open ? "Show" : "Hide";
  });

  $("copy-full")?.addEventListener("click", (e) =>
    copyText(results.dataset.raw || "", e.currentTarget),
  );
  $("copy-sans")?.addEventListener("click", (e) =>
    copyText(results.dataset.rawSans || "", e.currentTarget),
  );

  results.querySelectorAll("button.copy").forEach((btn) => {
    btn.addEventListener("click", () =>
      copyText(decodeURIComponent(btn.dataset.copy || ""), btn),
    );
  });
  bindProductionPicks(results);

  const statusTee = teeMismatch ? registryTee : a.teeId;
  const statusChain = data.chainId ?? a.chainId;
  const statusExt = queriedId ?? a.extensionId;
  loadMachineStatus(statusTee, statusChain, statusExt, {
    source: data.source,
    initialOwner: a.initialOwner,
  });
  loadInstructionSender(statusExt, statusChain);
}

async function findExtension(index = 0) {
  showError("");
  const extensionId = extensionInput.value.trim();
  if (!extensionId) {
    showError("Enter an extension id (decimal or 0x hex).");
    return;
  }
  btnExtension.disabled = true;
  btnExtension.textContent = "Finding…";
  try {
    const q = new URLSearchParams({
      extensionId,
      chainId: chainSelect.value,
      index: String(index),
    });
    const res = await fetch(`/api/extension?${q}`);
    const body = await readJson(res);
    if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
    if (body.extensionId) extensionInput.value = body.extensionId;
    if (body.analyzed) render(body);
    else renderExtensionMiss(body);
  } catch (e) {
    showError(e.message || String(e));
  } finally {
    btnExtension.disabled = false;
    btnExtension.textContent = "Find";
  }
}

async function analyzeFetch() {
  showError("");
  const url = urlInput.value.trim();
  if (!url) {
    showError("Enter a proxy /info URL, or use a preset.");
    return;
  }
  btnFetch.disabled = true;
  btnFetch.textContent = "Loading…";
  try {
    const q = encodeURIComponent(url);
    const res = await fetch(`/api/analyze?url=${q}`);
    const body = await res.json();
    if (!body.ok) throw new Error(body.error || "analyze failed");
    render(body);
  } catch (e) {
    showError(e.message || String(e));
  } finally {
    btnFetch.disabled = false;
    btnFetch.textContent = "Analyze";
  }
}

async function analyzePaste() {
  showError("");
  btnPaste.disabled = true;
  btnPaste.textContent = "Parsing…";
  try {
    let json;
    try {
      json = JSON.parse(pasteInput.value);
    } catch {
      throw new Error("paste is not valid JSON");
    }
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    });
    const body = await res.json();
    if (!body.ok) throw new Error(body.error || "analyze failed");
    render(body);
  } catch (e) {
    showError(e.message || String(e));
  } finally {
    btnPaste.disabled = false;
    btnPaste.textContent = "Analyze paste";
  }
}

modeExtension.addEventListener("click", () => setMode("extension"));
modeFetch.addEventListener("click", () => setMode("fetch"));
modePaste.addEventListener("click", () => setMode("paste"));
btnExtension.addEventListener("click", () => findExtension(0));
btnFetch.addEventListener("click", analyzeFetch);
btnPaste.addEventListener("click", analyzePaste);
extensionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") findExtension(0);
});
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") analyzeFetch();
});

document.querySelectorAll("[data-url]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setMode("fetch");
    urlInput.value = btn.dataset.url;
  });
});

document.querySelectorAll("[data-extension]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setMode("extension");
    extensionInput.value = btn.dataset.extension;
    if (btn.dataset.chain) chainSelect.value = btn.dataset.chain;
    findExtension(0);
  });
});
