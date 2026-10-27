"use client";

import { type ReactNode, useState } from "react";
import { copyText } from "@/lib/format";

export function Field({
  label,
  children,
  mono = false,
  copy,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  copy?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stat">
      <label>{label}</label>
      <strong className={mono ? "mono" : undefined}>{children}</strong>
      {copy ? (
        <div style={{ marginTop: ".35rem" }}>
          <button
            type="button"
            className="tiny copy"
            onClick={async () => {
              const ok = await copyText(copy);
              if (ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1100);
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
