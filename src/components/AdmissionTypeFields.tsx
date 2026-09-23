"use client";

import { useState } from "react";
import { EXPECTED_DETOX_NIGHTS, type AdmissionKind } from "@/lib/types";

export function AdmissionTypeFields({ disabled }: { disabled: boolean }) {
  const [kind, setKind] = useState<AdmissionKind | "">("");
  const [detoxFirst, setDetoxFirst] = useState<"" | "0" | "1">("");

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Admission type</span>
        <select
          name="admission_kind"
          required
          value={kind}
          disabled={disabled}
          onChange={(event) => {
            setKind(event.target.value as AdmissionKind | "");
            setDetoxFirst("");
          }}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3 disabled:opacity-60"
        >
          <option value="" disabled>
            Choose Treatment or Short stay
          </option>
          <option value="program">Treatment</option>
          <option value="detox_containment">Short stay</option>
        </select>
        <span className="mt-1 block text-xs text-muted">
          Treatment is the main path. Short stay is for detox-only or brief admissions.
        </span>
      </label>

      {kind === "program" ? (
        <fieldset className="space-y-3" disabled={disabled}>
          <legend className="text-sm font-medium">Needs detox first?</legend>
          <p className="text-xs text-muted">
            If yes, they detox and then continue into the chosen phase on this same admission. No second admit.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-linen px-3">
              <input
                type="radio"
                name="detox_first"
                value="0"
                required
                checked={detoxFirst === "0"}
                onChange={() => setDetoxFirst("0")}
              />
              No
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-linen px-3">
              <input
                type="radio"
                name="detox_first"
                value="1"
                required
                checked={detoxFirst === "1"}
                onChange={() => setDetoxFirst("1")}
              />
              Yes
            </label>
          </div>
          {detoxFirst === "1" ? (
            <label className="block">
              <span className="text-sm font-medium">Expected detox nights</span>
              <select
                name="expected_detox_nights"
                required
                defaultValue=""
                className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
              >
                <option value="" disabled>
                  1–5 nights
                </option>
                {EXPECTED_DETOX_NIGHTS.map((nights) => (
                  <option key={nights} value={nights}>
                    {nights} {nights === 1 ? "night" : "nights"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="expected_detox_nights" value="0" />
          )}
        </fieldset>
      ) : (
        <>
          <input type="hidden" name="detox_first" value="0" />
          <input type="hidden" name="expected_detox_nights" value="0" />
          {kind === "detox_containment" ? (
            <p className="rounded-2xl bg-sand px-4 py-3 text-sm">
              Short stay is detox-only or a brief admission. It does not continue into the treatment programme.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
