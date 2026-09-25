import type { CSSProperties } from "react";
import { intakeErrorMessage, preferredHouseLabel, turnstileSiteKey, type Attribution, type LeadForm } from "@/lib/lead-forms";
import { marketingSourceLabel } from "@/lib/marketing-sources";

const ATTRIBUTION_SCRIPT = `(function () {
  var params = new URLSearchParams(window.location.search);
  function field(name) {
    return document.querySelector('[name="' + name + '"]');
  }
  function setIfEmpty(name, value) {
    var el = field(name);
    if (!el || el.value) return;
    if (value) el.value = String(value).slice(0, 2000);
  }
  ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid","landing_url","referrer_url"].forEach(function (key) {
    setIfEmpty(key, params.get(key) || "");
  });
  var placement = field("placement");
  var embed = placement && placement.value === "embed";
  if (embed) {
    setIfEmpty("landing_url", document.referrer || "");
    setIfEmpty("parent_host", document.referrer || "");
  } else {
    setIfEmpty("landing_url", window.location.href);
    setIfEmpty("referrer_url", document.referrer || "");
  }
})();`;

export function PublicLeadForm({
  form,
  embed,
  sent,
  error,
  defaults,
  parentHost,
}: {
  form: LeadForm;
  embed?: boolean;
  sent?: boolean;
  error?: string;
  defaults: Attribution;
  parentHost?: string;
}) {
  const siteKey = turnstileSiteKey();
  if (sent) {
    return (
      <ThankYou
        title="Thank you"
        body="Admissions has this enquiry and will be in touch."
      />
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: embed ? 16 : "32px 16px 48px" }}>
      <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#3f5d4e" }}>
        Liberty Home
      </p>
      <h1 style={{ margin: "8px 0 0", fontFamily: "var(--font-fraunces), Georgia, serif", fontSize: embed ? 32 : 40, fontWeight: 500, color: "#2f463b" }}>
        {form.name}
      </h1>
      <p style={{ margin: "8px 0 0", color: "#6b6256", lineHeight: 1.5 }}>
        Tell admissions how to reach you. This opens a new enquiry for {marketingSourceLabel(form.lead_source)}
        {form.campaign ? ` · ${form.campaign}` : ""}. Weltevreden Manor and Liberty Lodge, Cape Town.
      </p>
      <form
        method="post"
        action={`/api/lead-forms/${form.slug}/submit`}
        style={{ marginTop: 20, background: "#fbf7f0", border: "1px solid #d8cbb8", borderRadius: 24, padding: 20 }}
      >
        <input type="hidden" name="placement" value={embed ? "embed" : "hosted"} />
        <input type="hidden" name="parent_host" defaultValue={parentHost || ""} />
        {Object.entries(defaults).map(([key, value]) => (
          <input key={key} type="hidden" name={key} defaultValue={value} />
        ))}
        <div aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
          <label>
            Company website
            <input name="company_website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        {error ? (
          <p style={{ marginTop: 0, color: "#b56a45" }}>{intakeErrorMessage(error)}</p>
        ) : null}
        <Field label="Caller name" name="caller_name" required autoComplete="name" />
        <Field label="Resident name, if different" name="resident_name" autoComplete="name" />
        <Field label="Phone" name="phone" type="tel" autoComplete="tel" />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <p style={{ margin: "-6px 0 12px", fontSize: 13, color: "#6b6256" }}>Phone or email is enough.</p>
        <Field label="Country" name="country" autoComplete="country-name" />
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Preferred house</span>
          <select name="preferred_house" defaultValue="unsure" style={controlStyle}>
            <option value="manor">{preferredHouseLabel("manor")}</option>
            <option value="lodge">{preferredHouseLabel("lodge")}</option>
            <option value="unsure">{preferredHouseLabel("unsure")}</option>
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Message</span>
          <textarea name="message" rows={4} style={{ ...controlStyle, height: "auto", padding: 12 }} />
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "8px 0 16px", fontSize: 14, lineHeight: 1.45 }}>
          <input type="checkbox" name="popia_consent" value="1" required style={{ marginTop: 4 }} />
          <span>
            I agree that Liberty Home may use these details to answer this enquiry, as described in the{" "}
            <a href={form.privacy_url} style={{ color: "#2f463b" }}>
              privacy notice
            </a>
            .
          </span>
        </label>
        {siteKey ? <div className="cf-turnstile" data-sitekey={siteKey} style={{ marginBottom: 16 }} /> : null}
        <button type="submit" style={{ minHeight: 48, width: "100%", border: 0, borderRadius: 999, background: "#3f5d4e", color: "#fbf7f0", font: "inherit", cursor: "pointer" }}>
          Send enquiry
        </button>
      </form>
      <script dangerouslySetInnerHTML={{ __html: ATTRIBUTION_SCRIPT }} />
      {siteKey ? <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
    </div>
  );
}

export function ThankYou({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 16px" }}>
      <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#3f5d4e" }}>
        Liberty Home
      </p>
      <h1 style={{ margin: "8px 0 0", fontFamily: "var(--font-fraunces), Georgia, serif", fontSize: 40, fontWeight: 500, color: "#2f463b" }}>
        {title}
      </h1>
      <p style={{ marginTop: 12, color: "#6b6256", lineHeight: 1.5 }}>{body}</p>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>
        {label}
        {required ? " *" : ""}
      </span>
      <input name={name} type={type} required={required} autoComplete={autoComplete} style={controlStyle} />
    </label>
  );
}

const controlStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  minHeight: 48,
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d8cbb8",
  background: "#f3eee4",
  padding: "0 12px",
  font: "inherit",
  color: "#2a241c",
};
