import { marketingSourceLabel } from "@/lib/marketing-sources";
import { preferredHouseLabel, type EnquiryIntake, type EnquiryTouch } from "@/lib/lead-forms";
import { SourceBadge } from "./SourceBadge";

function channelLabel(channel: string) {
  if (channel === "hosted") return "Hosted form";
  if (channel === "embed") return "Embedded form";
  if (channel === "meta") return "Meta Lead Ads";
  if (channel === "google") return "Google Ads";
  return channel || "Lead form";
}

function consentLine(intake: EnquiryIntake) {
  if (intake.channel === "meta" || intake.channel === "google") return "Consent collected on the ad platform.";
  if (intake.popia_consent === 1) return "POPIA consent ticked.";
  return "Consent not recorded.";
}

function LinkValue({ value }: { value: string }) {
  if (!value) return <span className="text-muted">—</span>;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="break-all underline-offset-2 hover:underline">
        {value}
      </a>
    );
  }
  return <span className="break-all">{value}</span>;
}

export function IntakePanel({ intake, touches }: { intake: EnquiryIntake; touches: EnquiryTouch[] }) {
  const later = touches.slice(1);
  const rows: { label: string; value: string; link?: boolean }[] = [
    { label: "utm_source", value: intake.utm_source },
    { label: "utm_medium", value: intake.utm_medium },
    { label: "utm_campaign", value: intake.utm_campaign },
    { label: "utm_term", value: intake.utm_term },
    { label: "utm_content", value: intake.utm_content },
    { label: "gclid", value: intake.gclid },
    { label: "fbclid", value: intake.fbclid },
  ];

  return (
    <section className="rounded-3xl border border-line bg-paper p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="serif text-2xl text-sage-deep">How this enquiry arrived</h2>
        <SourceBadge label={marketingSourceLabel(intake.intake_source)} campaign={intake.campaign} />
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Item label="Channel" value={channelLabel(intake.channel)} />
        <Item label="Form" value={intake.form_name || "—"} />
        <Item label="Caller" value={intake.caller_name || "—"} />
        <Item label="Resident" value={intake.resident_name || "—"} />
        <Item label="Country" value={intake.country || "—"} />
        <Item label="Preferred house" value={preferredHouseLabel(intake.preferred_house) || "—"} />
        <Item label="Consent" value={consentLine(intake)} />
        <Item label="Campaign" value={intake.campaign || "—"} />
      </dl>
      {intake.message ? <p className="mt-4 whitespace-pre-wrap text-sm">{intake.message}</p> : null}
      <h3 className="mt-6 text-sm font-medium">Attribution</h3>
      <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
        {rows.map((row) => (
          <Item key={row.label} label={row.label} value={row.value || "—"} />
        ))}
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Referring page</dt>
          <dd className="mt-1">
            <LinkValue value={intake.referrer_url} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Landing URL</dt>
          <dd className="mt-1">
            <LinkValue value={intake.landing_url} />
          </dd>
        </div>
      </dl>
      {later.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-medium">Later touches</h3>
          <ul className="mt-2 space-y-3">
            {later.map((touch) => (
              <li key={touch.id} className="rounded-2xl border border-line bg-linen px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wider text-muted">
                  {touch.created_at.slice(0, 16).replace("T", " ")} UTC · {channelLabel(touch.channel)}
                  {touch.campaign ? ` · ${touch.campaign}` : ""}
                </p>
                {touch.message ? <p className="mt-2 whitespace-pre-wrap">{touch.message}</p> : null}
                <p className="mt-2 text-muted">
                  {[touch.utm_source && `utm_source ${touch.utm_source}`, touch.utm_campaign && `utm_campaign ${touch.utm_campaign}`, touch.gclid && `gclid ${touch.gclid}`, touch.fbclid && `fbclid ${touch.fbclid}`]
                    .filter(Boolean)
                    .join(" · ") || "No extra click ids on this touch."}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 break-all">{value}</dd>
    </div>
  );
}
