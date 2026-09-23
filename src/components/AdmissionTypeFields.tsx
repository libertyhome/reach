"use client";

import { useState } from "react";
import { EXPECTED_DETOX_NIGHTS, type AdmissionKind } from "@/lib/types";

export function AdmissionTypeFields({
  disabled,
  detoxFirst: storedDetoxFirst,
  expectedDetoxNights,
}: {
  disabled: boolean;
  detoxFirst: number;
  expectedDetoxNights: number;
}) {
  const storedDays =
    storedDetoxFirst === 1 && expectedDetoxNights >= 1 && expectedDetoxNights <= 5 ? expectedDetoxNights : 0;
  const [kind, setKind] = useState<AdmissionKind | "">("");
  const [detoxFirst, setDetoxFirst] = useState<"" | "0" | "1">(storedDays ? "1" : "");
  const [days, setDays] = useState(storedDays ? String(storedDays) : "");

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
            const next = event.target.value as AdmissionKind | "";
            setKind(next);
            setDetoxFirst(next === "program" && storedDays ? "1" : "");
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
            {storedDays
              ? `Detox add-on is set to ${storedDays} ${storedDays === 1 ? "day" : "days"}. Confirm that count so Within receives it. Change the add-on on the commercial file if the days should differ.`
              : "If yes, choose 1–5 days. They detox, then continue into the chosen phase on this same admission."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={`flex min-h-12 items-center gap-3 rounded-xl border border-line bg-linen px-3 ${storedDays > 0 ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="detox_first"
                value="0"
                required
                checked={detoxFirst === "0"}
                disabled={storedDays > 0}
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
              <span className="text-sm font-medium">Detox days</span>
              <select
                name="expected_detox_nights"
                required
                value={storedDays ? String(storedDays) : days}
                onChange={(event) => {
                  if (!storedDays) setDays(event.target.value);
                }}
                className={`mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3 ${storedDays ? "cursor-not-allowed opacity-80" : ""}`}
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
              {storedDays
                ? `Detox add-on is set to ${storedDays} ${storedDays === 1 ? "day" : "days"}. Choose Treatment so that count is sent to Within, or turn Detox off for a short stay.`
                : "Short stay is detox-only or a brief admission. It does not continue into the treatment programme."}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
