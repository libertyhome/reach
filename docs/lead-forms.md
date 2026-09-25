# Lead forms

Reach can open a **New Enquiry** from every place the marketing team collects a lead: a hosted page, an embed on a landing page, a Meta (Facebook or Instagram) lead form, or a Google Ads lead form extension.

Executive is the admin desk (Reach has no separate admin role). Only that role can create forms and open the source report. Admissions sees the enquiry on **Enquiries** with a source badge.

Secrets are environment variables on the Reach host. Do not put them in the form builder, in the page HTML, or in this repository.

## Create a form

1. Sign in as Executive.
2. Open **Lead forms**.
3. Choose **New form**.
4. Name it for the placement, for example `Meta ads — Manor spring`.
5. Choose the lead source. The list is:
   - Recovery.com
   - Returning Client
   - Ex-resident
   - Google.com
   - Google.nl
   - Google.be
   - Meta ads
   - Google ad words
   - Recovery Coach
   - Referrer
   - Personal Contact
6. Add a campaign label if this placement is a specific push (for example `Spring 2026`). The monthly report groups by that label.
7. Save. The form page shows the hosted URL, an iframe snippet, and a script snippet.

Leave **External form id** blank unless you are connecting a Meta or Google lead form (see below). Put the platform’s form id there so those webhooks use this source and campaign.

## What the visitor fills in

- Caller name
- Resident name, if it is different
- Phone or email (one is enough)
- Country
- Preferred house: Manor, Lodge, or Unsure
- Message
- A POPIA consent tick, linked to the privacy notice (`/privacy`, or another https link you set on the form)

The enquiry card uses the resident’s name when it was given, and keeps the caller on the enquiry as well.

## Place the form

### Hosted page

Send people to:

```text
https://<reach-host>/f/<slug>
```

UTM parameters on that URL are stored on the enquiry, along with `gclid`, `fbclid`, the referring page, and the landing URL.

Example:

```text
https://<reach-host>/f/meta-ads-manor-spring?utm_source=facebook&utm_medium=paid&utm_campaign=spring-2026&utm_content=video-a&fbclid=...
```

### Embed

Prefer the script. It copies `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, and `fbclid` from the landing page, and records the landing URL and the referring page.

```html
<script src="https://<reach-host>/api/lead-forms/<slug>/script" async></script>
```

An iframe is also available. On its own it does not see the parent page’s query string, so use the script when the landing page carries UTMs.

```html
<iframe src="https://<reach-host>/f/<slug>/embed" title="Liberty Home enquiry" style="width:100%;min-height:920px;border:0;"></iframe>
```

### Allowed websites

**Allowed embed domains** is one host per line (`libertyhome.co.za`, `www.example.com`). The embed document sends `Content-Security-Policy: frame-ancestors` for those hosts (and Reach itself), so other sites cannot frame it.

If the browser tells Reach which site framed the form, a submit from anywhere else is rejected. Leave the list blank to keep the embed on Reach only. The hosted page stays public either way.

Cross-origin `fetch` to the submit URL is allowed only from those hosts (and from Reach). Same-origin posts from the hosted page and the embed are allowed.

## What is stored on the enquiry

The New Enquiry shows a source badge (the lead source, plus the campaign label when you set one). Open the card for caller, resident, country, preferred house, consent, and:

| Field | Meaning |
| --- | --- |
| utm_source, utm_medium, utm_campaign, utm_term, utm_content | From the landing page URL |
| gclid | Google click id |
| fbclid | Meta click id |
| Referring page | The page that sent the visitor |
| Landing URL | The page the form was on |

A second submission with the same phone or email within 24 hours does not open another enquiry. It is attached as a later touch on the existing one. The match uses the last 9 digits of the phone, so `082…` and `+27 82…` count as the same number. The source report counts enquiries, not repeat touches. Months are Africa/Johannesburg.

## Spam protection

- A hidden honeypot field. Filled-in submissions are discarded.
- Rate limit: 8 submissions per IP address per form per 10 minutes.
- Optional Cloudflare Turnstile. Set both variables and the checkbox appears on the form. If the secret is set and the check fails, the enquiry is not saved.

```text
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

## Source report

**Lead forms → Source report** lists enquiries by month, source, and campaign. Filter to one month or show all.

## Meta Lead Ads (Facebook and Instagram)

Ops sets these on the Reach host. Marketing does not paste the secrets into Reach.

| Variable | Purpose |
| --- | --- |
| `META_LEADGEN_VERIFY_TOKEN` | Handshake token you also type into Meta |
| `META_APP_SECRET` | Checks the `X-Hub-Signature-256` header on each delivery |
| `META_PAGE_ACCESS_TOKEN` | Page token used to read the lead from the Graph API |
| `META_GRAPH_VERSION` | Optional. Defaults to `v21.0` |

Without the page token, Reach still files a New Enquiry for the lead id and source **Meta ads**, and the card says the contact details were not fetched. With the token, Reach calls `GET https://graph.facebook.com/<version>/<leadgen_id>` and maps name, email, phone, country, and any house, resident, or message answers.

Webhook limit: 60 deliveries per 10 minutes per IP.

### Setup

1. In Reach, create a form with source **Meta ads**, the campaign label, and **External form id** set to the Meta lead form id (optional, but then the campaign is filled in).
2. In the Meta app, add the Page webhook field `leadgen`.
3. Callback URL: `https://<reach-host>/api/webhooks/meta-leads`
4. Verify token: the same value as `META_LEADGEN_VERIFY_TOKEN`. Reach answers the `hub.challenge` handshake.
5. App secret on the host must match the app so signatures verify. Deliveries without a valid signature are rejected.
6. Create a Page access token that can read leads, and set `META_PAGE_ACCESS_TOKEN`.
7. Subscribe the Page to the app.
8. Send a test lead from Meta. A New Enquiry should appear with the **Meta ads** badge. If the external form id matches, the campaign label is the one on the Reach form.

Meta will retry when Reach returns an error. A repeated `leadgen_id` does not open a second enquiry.

## Google Ads lead form extensions

| Variable | Purpose |
| --- | --- |
| `GOOGLE_ADS_WEBHOOK_KEY` | Shared key Google sends as `google_key` |

Webhook URL:

```text
https://<reach-host>/api/webhooks/google-ads-leads
```

Reach accepts the key in the JSON body (`google_key`, which Google’s lead form webhook sends), the query `?google_key=`, or the header `X-Google-Ads-Key`. If the variable is unset, the endpoint refuses the delivery. A wrong key is rejected.

1. In Reach, create a form with source **Google ad words** and, if you want that campaign, put the Google form id in **External form id**.
2. In Google Ads, open the lead form extension and set the webhook URL and the same key.
3. Send a test lead. Reach files a New Enquiry with the **Google ad words** badge. Test leads are marked as tests in the notes. `gcl_id` is stored as `gclid`.
4. A repeated `lead_id` does not open a second enquiry.

Mapped answers include full name (or first and last), email, phone, country, and custom questions whose labels mention resident, house, or message.

## Other host settings

`REACH_PUBLIC_URL` (optional) is the origin shown in the copy-paste snippets, for example `https://reach.example.com`. When it is unset, snippets use the host you are browsing.

## Conflict notes for tonight’s other Reach PRs

Do not merge this together with those branches without reading this.

**Enquiry form PR** (caller name, resident name, lead sources). This branch does not edit `NewEnquiryForm` or `LeadSourceForm`, and it does not replace `LEAD_SOURCES`. Caller, resident, country, consent, campaign, and the exact marketing source are stored on `enquiry_intake` / `enquiry_touches`. The staff `people.lead_source` column still receives a mapped value from `legacyLeadSource()` in `src/lib/marketing-sources.ts` (`website`, `referral_partner`, `family`, or `other` today). The badge and the report use the marketing source, not that mapped value. When the enquiry-form branch replaces `LEAD_SOURCES` with Recovery.com, Meta ads, and the rest, point `legacyLeadSource()` at those new values (or write them straight into `lead_source`) so the staff dropdown and the badge agree. If that branch adds `caller_name` / `resident_name` columns on `people`, keep them; this branch did not add those columns.

**Beds and Send-to-Within PR.** This branch does not change rooms, bed assignment, `within-send`, or `SendToWithin`. The only shared pipeline edit is an optional `house_preference` argument on `createEnquiry`.

This work does not change the Railway service `reach-base`.
