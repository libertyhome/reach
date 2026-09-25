import assert from "assert";
import { createHmac } from "crypto";
import { canManageLeadForms } from "../src/lib/access";
import { getDb } from "../src/lib/db";
import {
  checkRateLimit,
  acceptPublicSubmission,
  embedParentAllowed,
  enquirySourceReport,
  frameAncestorsCsp,
  getEnquiryIntake,
  isOriginAllowed,
  listEnquiryTouches,
  listSourceBadges,
  parseAllowedDomains,
  saveLeadForm,
} from "../src/lib/lead-forms";
import { ingestGoogleLead, ingestMetaLeadgen, metaSignatureStatus, metaVerifyChallenge } from "../src/lib/lead-webhooks";
import { MARKETING_LEAD_SOURCES, legacyLeadSource } from "../src/lib/marketing-sources";
import { getPerson } from "../src/lib/people";

const LABELS = [
  "Recovery.com",
  "Returning Client",
  "Ex-resident",
  "Google.com",
  "Google.nl",
  "Google.be",
  "Meta ads",
  "Google ad words",
  "Recovery Coach",
  "Referrer",
  "Personal Contact",
];

function wipeQaLeadForms() {
  const db = getDb();
  const ids = new Set<string>();
  const people = db.prepare(`SELECT id FROM people WHERE email LIKE 'qa-leadform-%@example.invalid'`).all() as { id: string }[];
  for (const person of people) ids.add(person.id);
  const touches = db
    .prepare(
      `SELECT person_id FROM enquiry_touches
       WHERE normalized_email LIKE 'qa-leadform-%@example.invalid'
          OR external_id LIKE 'google:qa-%'
          OR external_id IN ('meta:445566', 'meta:778899')`,
    )
    .all() as { person_id: string }[];
  for (const touch of touches) ids.add(touch.person_id);
  for (const id of ids) {
    db.prepare(`DELETE FROM audit_events WHERE entity_id = ?`).run(id);
    db.prepare(`DELETE FROM enquiry_touches WHERE person_id = ?`).run(id);
    db.prepare(`DELETE FROM enquiry_intake WHERE person_id = ?`).run(id);
    db.prepare(`DELETE FROM people WHERE id = ?`).run(id);
  }
  const forms = db.prepare(`SELECT id FROM lead_forms WHERE slug LIKE 'qa-%'`).all() as { id: string }[];
  for (const form of forms) {
    db.prepare(`DELETE FROM lead_form_hits WHERE form_id = ?`).run(form.id);
    db.prepare(`DELETE FROM enquiry_touches WHERE form_id = ?`).run(form.id);
    db.prepare(`DELETE FROM enquiry_intake WHERE form_id = ?`).run(form.id);
    db.prepare(`DELETE FROM lead_forms WHERE id = ?`).run(form.id);
  }
  db.prepare(`DELETE FROM lead_form_hits WHERE ip LIKE 'qa-%' OR form_id LIKE 'webhook:%' OR form_id = 'qa-bucket'`).run();
}

export async function assertLeadForms() {
  const savedEnv = {
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_LEADGEN_VERIFY_TOKEN: process.env.META_LEADGEN_VERIFY_TOKEN,
    META_PAGE_ACCESS_TOKEN: process.env.META_PAGE_ACCESS_TOKEN,
    GOOGLE_ADS_WEBHOOK_KEY: process.env.GOOGLE_ADS_WEBHOOK_KEY,
  };
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.META_APP_SECRET;
  delete process.env.META_LEADGEN_VERIFY_TOKEN;
  delete process.env.META_PAGE_ACCESS_TOKEN;
  delete process.env.GOOGLE_ADS_WEBHOOK_KEY;
  wipeQaLeadForms();
  try {
    assert.deepStrictEqual(
      MARKETING_LEAD_SOURCES.map((source) => source.label),
      LABELS,
    );
    assert.strictEqual(legacyLeadSource("meta_ads"), "website");
    assert.strictEqual(canManageLeadForms({ role: "executive" }), true);
    assert.strictEqual(canManageLeadForms({ role: "admissions" }), false);
    assert.deepStrictEqual(parseAllowedDomains("https://www.Example.com/path, ads.example.com"), ["www.example.com", "ads.example.com"]);
    assert.strictEqual(isOriginAllowed("https://ads.example.com", ["example.com"], "reach.example"), true);
    assert.strictEqual(isOriginAllowed("https://evil.test", ["example.com"], "reach.example"), false);
    assert.strictEqual(isOriginAllowed("https://reach.example", [], "reach.example"), true);
    assert.strictEqual(embedParentAllowed("", ["example.com"], "reach.example"), true);
    assert.strictEqual(embedParentAllowed("https://evil.test/ad", ["example.com"], "reach.example"), false);
    assert.strictEqual(embedParentAllowed("https://ads.example.com/ad", ["example.com"], "reach.example"), true);
    assert.ok(frameAncestorsCsp(["landing.example.com"]).includes("https://landing.example.com"));
    assert.strictEqual(checkRateLimit("qa-ip", "qa-bucket", 2, 60_000), true);
    assert.strictEqual(checkRateLimit("qa-ip", "qa-bucket", 2, 60_000), true);
    assert.strictEqual(checkRateLimit("qa-ip", "qa-bucket", 2, 60_000), false);

    const created = saveLeadForm({
      name: "QA Meta spring",
      slug: "qa-meta-spring",
      leadSource: "meta_ads",
      campaign: "QA Spring",
      allowedDomains: "example.com",
      externalKey: "",
      privacyUrl: "/privacy",
      active: true,
    });
    assert.strictEqual(created.ok, true);
    if (!created.ok) return;

    const fields = {
      caller_name: "Jane Caller",
      resident_name: "Alex Resident",
      phone: "+27 82 555 0191",
      email: "qa-leadform-a@example.invalid",
      country: "Netherlands",
      preferred_house: "manor",
      message: "Please call after 3.",
      popia_consent: "1",
      utm_source: "facebook",
      utm_medium: "paid",
      utm_campaign: "spring-2026",
      utm_term: "cape-town-rehab",
      utm_content: "video-a",
      gclid: "qa-gclid",
      fbclid: "qa-fbclid",
      referrer_url: "https://instagram.com/p/qa",
      landing_url: "https://landing.example.com/manor",
    };

    const honeypot = await acceptPublicSubmission({
      slug: created.form.slug,
      fields: { ...fields, email: "qa-leadform-honey@example.invalid", company_website: "https://spam.test" },
      ip: "qa-honey",
      appHost: "localhost",
    });
    assert.strictEqual(honeypot.ok && honeypot.dropped, true);
    const honeyCount = getDb().prepare(`SELECT COUNT(*) AS n FROM people WHERE email = ?`).get("qa-leadform-honey@example.invalid") as { n: number };
    assert.strictEqual(honeyCount.n, 0);

    const noConsent = await acceptPublicSubmission({
      slug: created.form.slug,
      fields: { ...fields, popia_consent: "" },
      ip: "qa-consent",
      appHost: "localhost",
    });
    assert.strictEqual(noConsent.ok, false);
    if (!noConsent.ok) assert.strictEqual(noConsent.code, "consent");

    const blocked = await acceptPublicSubmission({
      slug: created.form.slug,
      fields: { ...fields, placement: "embed", parent_host: "https://evil.test/ad" },
      ip: "qa-embed-block",
      appHost: "localhost",
    });
    assert.strictEqual(blocked.ok, false);
    if (!blocked.ok) assert.strictEqual(blocked.code, "embed");

    const first = await acceptPublicSubmission({
      slug: created.form.slug,
      fields,
      ip: "qa-first",
      appHost: "localhost",
    });
    assert(first.ok && !first.dropped && first.deduped === false);
    if (!first.ok || first.dropped) return;
    const person = getPerson(first.personId);
    assert(person, "lead form enquiry exists");
    assert.strictEqual(person.first_name, "Alex");
    assert.strictEqual(person.last_name, "Resident");
    assert.strictEqual(person.stage, "enquiry");
    assert.strictEqual(person.lead_source, "website");
    assert.strictEqual(person.lead_source_note, "Meta ads · QA Spring");
    assert.strictEqual(person.house_preference, "manor");
    const intake = getEnquiryIntake(person.id);
    assert(intake, "intake row");
    assert.strictEqual(intake.intake_source, "meta_ads");
    assert.strictEqual(intake.campaign, "QA Spring");
    assert.strictEqual(intake.caller_name, "Jane Caller");
    assert.strictEqual(intake.resident_name, "Alex Resident");
    assert.strictEqual(intake.country, "Netherlands");
    assert.strictEqual(intake.utm_source, "facebook");
    assert.strictEqual(intake.utm_medium, "paid");
    assert.strictEqual(intake.utm_campaign, "spring-2026");
    assert.strictEqual(intake.utm_term, "cape-town-rehab");
    assert.strictEqual(intake.utm_content, "video-a");
    assert.strictEqual(intake.gclid, "qa-gclid");
    assert.strictEqual(intake.fbclid, "qa-fbclid");
    assert.strictEqual(intake.referrer_url, "https://instagram.com/p/qa");
    assert.strictEqual(intake.landing_url, "https://landing.example.com/manor");
    assert.strictEqual(intake.popia_consent, 1);
    const badge = listSourceBadges([person.id]).get(person.id);
    assert.strictEqual(badge?.label, "Meta ads");
    assert.strictEqual(badge?.campaign, "QA Spring");
    assert.ok(badge?.callerNote.includes("Jane Caller"));

    const again = await acceptPublicSubmission({
      slug: created.form.slug,
      fields: {
        ...fields,
        phone: "0825550191",
        email: "qa-leadform-b@example.invalid",
        message: "Second call, same family.",
        utm_content: "video-b",
      },
      ip: "qa-second",
      appHost: "localhost",
    });
    assert.strictEqual(again.ok && !again.dropped && again.deduped, true);
    if (!again.ok || again.dropped) return;
    assert.strictEqual(again.personId, person.id);
    assert.strictEqual(listEnquiryTouches(person.id).length, 2);
    const touched = getPerson(person.id);
    assert(touched?.commercial_notes.includes("Another lead form touch"));
    assert.strictEqual(
      (getDb().prepare(`SELECT COUNT(*) AS n FROM people WHERE email LIKE 'qa-leadform-%@example.invalid'`).get() as { n: number }).n,
      1,
    );

    const aged = await acceptPublicSubmission({
      slug: created.form.slug,
      fields: { ...fields, phone: "+27 82 555 0192", email: "qa-leadform-old@example.invalid", resident_name: "Old Resident" },
      ip: "qa-old",
      appHost: "localhost",
    });
    assert(aged.ok && !aged.dropped && !aged.deduped);
    if (!aged.ok || aged.dropped) return;
    const oldStamp = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    getDb().prepare(`UPDATE people SET created_at = ? WHERE id = ?`).run(oldStamp, aged.personId);
    getDb().prepare(`UPDATE enquiry_touches SET created_at = ? WHERE person_id = ?`).run(oldStamp, aged.personId);
    const fresh = await acceptPublicSubmission({
      slug: created.form.slug,
      fields: { ...fields, phone: "0825550192", email: "qa-leadform-old2@example.invalid", resident_name: "New Resident" },
      ip: "qa-fresh",
      appHost: "localhost",
    });
    assert(fresh.ok && !fresh.dropped && !fresh.deduped);
    if (!fresh.ok || fresh.dropped) return;
    assert.notStrictEqual(fresh.personId, aged.personId);

    process.env.TURNSTILE_SECRET_KEY = "qa-turnstile";
    const robot = await acceptPublicSubmission({
      slug: created.form.slug,
      fields: { ...fields, email: "qa-leadform-robot@example.invalid" },
      ip: "qa-robot",
      appHost: "localhost",
      verifyTurnstile: async () => false,
    });
    assert.strictEqual(robot.ok, false);
    if (!robot.ok) assert.strictEqual(robot.code, "turnstile");
    delete process.env.TURNSTILE_SECRET_KEY;

    const paused = saveLeadForm({
      name: "QA paused",
      slug: "qa-paused",
      leadSource: "google_com",
      campaign: "",
      allowedDomains: "",
      externalKey: "",
      privacyUrl: "/privacy",
      active: false,
    });
    assert(paused.ok);
    if (!paused.ok) return;
    const pausedSubmit = await acceptPublicSubmission({
      slug: paused.form.slug,
      fields,
      ip: "qa-paused",
      appHost: "localhost",
    });
    assert.strictEqual(pausedSubmit.ok, false);
    if (!pausedSubmit.ok) assert.strictEqual(pausedSubmit.code, "unavailable");

    const report = enquirySourceReport("all");
    assert.ok(report.some((row) => row.source === "meta_ads" && row.campaign === "QA Spring" && row.enquiries >= 1));

    process.env.GOOGLE_ADS_WEBHOOK_KEY = "qa-google-key";
    const linked = saveLeadForm({
      name: "QA Google",
      slug: "qa-google",
      leadSource: "google_ad_words",
      campaign: "Search brand",
      allowedDomains: "",
      externalKey: "qa-google-form",
      privacyUrl: "/privacy",
      active: true,
    });
    assert(linked.ok);
    const rejected = ingestGoogleLead({ lead_id: "qa-g-1" }, "wrong-key", { ip: "qa-google-bad" });
    assert.strictEqual(rejected.ok, false);
    if (!rejected.ok) assert.strictEqual(rejected.status, 401);
    const google = ingestGoogleLead(
      {
        lead_id: "qa-g-1",
        form_id: "qa-google-form",
        gcl_id: "qa-gclid-google",
        is_test: true,
        user_column_data: [
          { column_id: "FULL_NAME", column_name: "Full Name", string_value: "Greta Google" },
          { column_id: "EMAIL", column_name: "User Email", string_value: "qa-leadform-google@example.invalid" },
          { column_id: "PHONE", column_name: "User Phone", string_value: "+27 82 555 0193" },
        ],
      },
      "qa-google-key",
      { ip: "qa-google-ok" },
    );
    assert.strictEqual(google.ok, true);
    if (!google.ok) return;
    const googlePerson = getPerson(google.leads[0].personId);
    assert(googlePerson);
    assert.strictEqual(googlePerson.lead_source_note, "Google ad words · Search brand");
    const googleIntake = getEnquiryIntake(googlePerson.id);
    assert.strictEqual(googleIntake?.intake_source, "google_ad_words");
    assert.strictEqual(googleIntake?.campaign, "Search brand");
    assert.strictEqual(googleIntake?.gclid, "qa-gclid-google");
    assert.ok(googlePerson.commercial_notes.includes("Test lead from Google Ads"));
    const googleAgain = ingestGoogleLead({ lead_id: "qa-g-1", user_column_data: [] }, "qa-google-key", { ip: "qa-google-dup" });
    assert(googleAgain.ok && googleAgain.leads[0].duplicate);

    process.env.META_LEADGEN_VERIFY_TOKEN = "qa-verify";
    const handshake = metaVerifyChallenge(new URLSearchParams("hub.mode=subscribe&hub.verify_token=qa-verify&hub.challenge=challenge-token"));
    assert.strictEqual(handshake.status, 200);
    assert.strictEqual(handshake.body, "challenge-token");
    assert.strictEqual(metaVerifyChallenge(new URLSearchParams("hub.mode=subscribe&hub.verify_token=nope&hub.challenge=x")).status, 403);
    delete process.env.META_LEADGEN_VERIFY_TOKEN;
    assert.strictEqual(metaVerifyChallenge(new URLSearchParams("hub.mode=subscribe&hub.verify_token=qa-verify&hub.challenge=x")).status, 503);

    process.env.META_APP_SECRET = "qa-app-secret";
    const raw = JSON.stringify({
      object: "page",
      entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "445566", form_id: "qa-meta-form" } }] }],
    });
    const signature = createHmac("sha256", "qa-app-secret").update(raw).digest("hex");
    assert.strictEqual(metaSignatureStatus(raw, `sha256=${signature}`), "ok");
    assert.strictEqual(metaSignatureStatus(raw, "sha256=deadbeef"), "reject");
    delete process.env.META_APP_SECRET;
    assert.strictEqual(metaSignatureStatus(raw, `sha256=${signature}`), "unconfigured");

    const metaForm = saveLeadForm({
      name: "QA Meta webhook",
      slug: "qa-meta-webhook",
      leadSource: "meta_ads",
      campaign: "Instagram stories",
      allowedDomains: "",
      externalKey: "qa-meta-form",
      privacyUrl: "/privacy",
      active: true,
    });
    assert(metaForm.ok);
    const meta = await ingestMetaLeadgen(JSON.parse(raw), {
      ip: "qa-meta",
      fetchLead: async () => ({
        id: "445566",
        field_data: [
          { name: "full_name", values: ["Mina Meta"] },
          { name: "email", values: ["qa-leadform-meta@example.invalid"] },
          { name: "phone_number", values: ["+27 82 555 0194"] },
          { name: "country", values: ["Belgium"] },
        ],
      }),
    });
    assert(meta.ok);
    if (!meta.ok) return;
    const metaPerson = getPerson(meta.leads[0].personId);
    assert(metaPerson);
    assert.strictEqual(metaPerson.first_name, "Mina");
    const metaIntake = getEnquiryIntake(metaPerson.id);
    assert.strictEqual(metaIntake?.intake_source, "meta_ads");
    assert.strictEqual(metaIntake?.campaign, "Instagram stories");
    assert.strictEqual(metaIntake?.country, "Belgium");
    assert.strictEqual(metaPerson.email, "qa-leadform-meta@example.invalid");

    const stub = await ingestMetaLeadgen(
      { entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "778899" } }] }] },
      { ip: "qa-meta-stub", fetchLead: async () => null },
    );
    assert(stub.ok);
    if (!stub.ok) return;
    const stubPerson = getPerson(stub.leads[0].personId);
    assert(stubPerson?.commercial_notes.includes("META_PAGE_ACCESS_TOKEN"));
  } finally {
    wipeQaLeadForms();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
