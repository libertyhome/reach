"use client";

import { useState } from "react";

export function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-sm font-medium">
        {label}
        <button
          type="button"
          className="min-h-10 rounded-full border border-line px-3 text-xs font-normal"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
      <textarea
        readOnly
        value={value}
        rows={value.includes("\n") || value.length > 120 ? 4 : 2}
        className="mt-1 w-full rounded-xl border border-line bg-linen px-3 py-2 text-sm"
      />
    </label>
  );
}
