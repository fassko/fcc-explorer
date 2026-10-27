export const EXPLORERS: Record<number, string> = {
  114: "https://coston2-explorer.flare.network",
  16: "https://coston-explorer.flare.network",
  19: "https://songbird-explorer.flare.network",
  14: "https://flare-explorer.flare.network",
};

export function explorerBase(chainId: number): string {
  return EXPLORERS[Number(chainId)] || EXPLORERS[114];
}

export function shortHex(h: string, left = 6, right = 4): string {
  const s = String(h).startsWith("0x") ? String(h).slice(2) : String(h);
  if (s.length <= left + right) {
    return String(h).startsWith("0x") ? h : `0x${h}`;
  }
  return `0x${s.slice(0, left)}…${s.slice(-right)}`;
}

export function addrUrl(chainId: number, a: string): string {
  return `${explorerBase(chainId)}/address/${a}`;
}

export function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
  } catch {
    return String(iso);
  }
}

export function proxyBaseUrl(raw: string | null | undefined): string | null {
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

export function urlsMatch(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  const norm = (s: string) => String(s).trim().replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

export function statusBadgeClass(label: string): "ok" | "warn" | "err" {
  if (label === "PRODUCTION") return "ok";
  if (label === "INITIALIZED" || label === "SUSPENDED") return "warn";
  return "err";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
