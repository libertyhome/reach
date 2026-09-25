"use client";

import { useState } from "react";
import { MARKETING_LEAD_SOURCES, leadSourceNeedsWho } from "@/lib/marketing-sources";
import type { LeadForm } from "@/lib/lead-forms";

export function LeadFormEditor({
  action,
  form,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  form?: LeadForm;
  error?: string;
}) {
  const [source, setSource] = useState<string>(form?.lead_source ?? "meta_ads");
  const [who, setWho] = useState(form?.lead_source_who ?? "");
  const needsWho = leadSourceNeedsWho(source);

  return (
    <form action={action} className="max-w-xl space-y-4 rounded-3xl border border-line bg-paper p-6">
      {form ? <input type="hidden" name="id" value={form.id} /> : null}
      {error ? <p className="rounded-2xl border border-terracotta/40 bg-linen px-4 py-3 text-sm text-terracotta">{error}</p> : null}
      <label className="block">
        <span className="text-sm font-medium">Form name</span>
        <input name="name" required defaultValue={form?.name ?? ""} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Slug</span>
        <input
          name="slug"
          defaultValue={form?.slug ?? ""}
          placeholder="Filled from the name if you leave this blank"
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
        />
        <span className="mt-1 block text-sm text-muted">Used in the public URL. Changing it breaks links already placed on ads.</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Lead source</span>
        <select
          name="lead_source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
        >
          {MARKETING_LEAD_SOURCES.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-sm text-muted">Same list as a new enquiry. This is the badge on the New Enquiry.</span>
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
          <span className="mt-1 block text-sm text-muted">
            The coach, referrer, or personal contact. Each enquiry from this form keeps this name.
          </span>
        </label>
      ) : (
        <input type="hidden" name="lead_source_who" value="" />
      )}
      <label className="block">
        <span className="text-sm font-medium">Campaign label</span>
        <input name="campaign" defaultValue={form?.campaign ?? ""} placeholder="Spring 2026" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        <span className="mt-1 block text-sm text-muted">Optional. The monthly report groups by this label.</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Allowed embed domains</span>
        <textarea
          name="allowed_domains"
          rows={4}
          defaultValue={form?.allowed_domains ?? ""}
          placeholder={"libertyhome.co.za\nlanding.example.com"}
          className="mt-1 w-full rounded-xl border border-line bg-linen px-3 py-2"
        />
        <span className="mt-1 block text-sm text-muted">
          One website per line. Leave blank to keep the embed on Reach only. The hosted page stays public.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium">External form id</span>
        <input name="external_key" defaultValue={form?.external_key ?? ""} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        <span className="mt-1 block text-sm text-muted">
          Optional Meta lead form id or Google Ads form id, so those webhooks use this source, Who, and campaign.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Privacy link</span>
        <input name="privacy_url" defaultValue={form?.privacy_url ?? "/privacy"} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={form ? form.active === 1 : true} />
        Active — public page and webhooks can use this form
      </label>
      <button type="submit" className="min-h-12 rounded-full bg-sage px-5 text-paper">
        {form ? "Save form" : "Create form"}
      </button>
    </form>
  );
}
