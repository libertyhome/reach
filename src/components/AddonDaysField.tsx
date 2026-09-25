"use client";

import { useState } from "react";
import { ADDON_DAY_COUNTS } from "@/lib/types";

export function AddonDaysField({
  name,
  daysName,
  label,
  checked,
  days,
  hint,
}: {
  name: string;
  daysName: string;
  label: string;
  checked: boolean;
  days: number;
  hint?: string;
}) {
  const [on, setOn] = useState(checked);
  const [count, setCount] = useState(days >= 1 && days <= 14 ? String(days) : "");

  return (
    <li className="rounded-xl border border-line bg-paper px-3 py-2">
      <label className="flex min-h-10 items-center gap-3">
        <input
          type="checkbox"
          name={name}
          value="1"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          className="h-5 w-5 accent-[var(--sage)]"
        />
        <span>{label}</span>
      </label>
      {on ? (
        <label className="mt-2 block">
          <span className="text-sm font-medium">Number of days</span>
          <select
            name={daysName}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          >
            <option value="">Days not set</option>
            {ADDON_DAY_COUNTS.map((countOption) => (
              <option key={countOption} value={countOption}>
                {countOption} {countOption === 1 ? "day" : "days"}
              </option>
            ))}
          </select>
          {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
        </label>
      ) : (
        <input type="hidden" name={daysName} value="0" />
      )}
    </li>
  );
}
