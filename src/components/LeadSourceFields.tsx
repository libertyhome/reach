"use client";

import { useState } from "react";
import { LEAD_SOURCE_LABEL, leadSourceOptions } from "@/lib/labels";
import { LEAD_SOURCES_WITH_WHO } from "@/lib/types";

export function LeadSourceFields({
  leadSource,
  leadSourceNote,
  leadSourceWho,
}: {
  leadSource: string;
  leadSourceNote: string;
  leadSourceWho: string;
}) {
  const [source, setSource] = useState(leadSource);
  const [who, setWho] = useState(leadSourceWho);
  const needsWho = (LEAD_SOURCES_WITH_WHO as readonly string[]).includes(source);

  return (
    <>
      <label className="block">
        <span className="text-sm font-medium">Lead source</span>
        <select
          name="lead_source"
          required
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
        >
          <option value="" disabled>
            Choose a source
          </option>
          {leadSourceOptions(leadSource).map((option) => (
            <option key={option} value={option}>
              {LEAD_SOURCE_LABEL[option]}
            </option>
          ))}
        </select>
      </label>
      {needsWho ? (
        <label className="block">
          <span className="text-sm font-medium">Who?</span>
          <input
            name="lead_source_who"
            value={who}
            onChange={(event) => setWho(event.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          />
        </label>
      ) : (
        <input type="hidden" name="lead_source_who" value="" />
      )}
      <label className="block">
        <span className="text-sm font-medium">Lead source note</span>
        <input
          name="lead_source_note"
          defaultValue={leadSourceNote}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
        />
      </label>
    </>
  );
}
