"use client";

import { useState } from "react";
import { EXPECTED_DETOX_NIGHTS } from "@/lib/types";

export function DetoxAddonFields({
  detoxFirst,
  expectedDetoxNights,
}: {
  detoxFirst: number;
  expectedDetoxNights: number;
}) {
  const stored = detoxFirst === 1 && expectedDetoxNights >= 1 && expectedDetoxNights <= 5;
  const [on, setOn] = useState(stored);
  const [days, setDays] = useState(stored ? String(expectedDetoxNights) : "");

  return (
    <li className="rounded-xl border border-line bg-paper px-3 py-2">
      <label className="flex min-h-10 items-center gap-3">
        <input
          type="checkbox"
          name="detox_first"
          value="1"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          className="h-5 w-5 accent-[var(--sage)]"
        />
        <span>Detox</span>
      </label>
      {on ? (
        <label className="mt-2 block">
          <span className="text-sm font-medium">How many days</span>
          <select
            name="expected_detox_nights"
            required
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          >
            <option value="" disabled>
              1–5 days
            </option>
            {EXPECTED_DETOX_NIGHTS.map((count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? "day" : "days"}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">
            This day count is sent to Within on admit. Treatment continues on the same admission after detox.
          </span>
        </label>
      ) : (
        <input type="hidden" name="expected_detox_nights" value="0" />
      )}
    </li>
  );
}
