# Microsoft Entra sign-in for Reach

Staff sign-in can stay on the demo password, or move to Microsoft Entra ID for the libertyhomerehab.com tenant. Microsoft prompts for MFA only when its security defaults decide. The switch is the `AUTH_PROVIDER` flag. Leave it unset and Reach behaves as it does today, including on reach-base.

## Flag

| `AUTH_PROVIDER` | What staff see |
| --- | --- |
| unset or `demo` | Email and password. The demo account list follows `REACH_DEMO_LOGIN` (on outside production when unset; off in production when unset). |
| `both` | **Sign in with Microsoft** and the password form. No demo list and no prefilled password. The password form accepts only Vincent and Morgane. |
| `entra` | Microsoft only. The password form is hidden and `loginAction` refuses passwords. |

`both` and `entra` do not fall open. If `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, or `AUTH_MICROSOFT_ENTRA_ID_ISSUER` is missing, or the issuer is not a single tenant (`…/<tenant-id>/v2.0`, not `common`), `/login` shows **Microsoft sign-in is not configured** and passwords are refused.

Production refuses to start when `REACH_SECRET` is unset, in every mode, including demo. That check landed with the demo-login close and this change reuses it. Outside production, an unset `REACH_SECRET` still uses the built-in demo secret.

`REACH_DEMO_LOGIN=true` forces the demo account list on (set this on reach-base). `REACH_DEMO_LOGIN=false` forces it off. Unset is off when `NODE_ENV=production` and on otherwise. Microsoft modes never show the list. Leaving `AUTH_PROVIDER` unset does not turn on Entra.

`AUTH_REQUIRE_MFA` defaults to off. It is on only when set to `1`, `true`, or `yes`. Leave it unset on this tenant. See [Security defaults](#security-defaults).

## Security defaults

The tenant is **libertyhomerehab.com**. It uses free Microsoft Entra security defaults. There is no Entra ID P1 and no Conditional Access.

Security defaults require users to register for multifactor authentication, always challenge administrators, block legacy authentication, and prompt other users for MFA only when Microsoft decides. Reach cannot set a sign-in frequency. The Microsoft session length is whatever Entra issues. Reach's own Microsoft cookie still expires after 12 hours.

The ID token `amr` claim often does **not** contain `mfa` on those sign-ins, even for someone who has registered a second factor. Every Microsoft sign-in still writes `amr` to the audit log (`amr: pwd`, `amr: pwd,mfa`, or `amr: none`).

`AUTH_REQUIRE_MFA` must stay off under security defaults. Turning it on rejects a sign-in whose `amr` does not include `mfa`, which would block most staff. The check remains in the code for a later tenant that can guarantee the claim. Do not set the variable, or set it to `false`.

## Entra app registration (Liberty Reach)

Single tenant, domain **libertyhomerehab.com**. Staff sign in with their `@libertyhomerehab.com` work account. Do not reuse the Within Outlook calendar registration.

- Redirect URI (Web): `https://reach-production-aef1.up.railway.app/api/auth/callback/microsoft-entra-id`
- Also add `https://reach-production-aef1.up.railway.app/login` as a Web redirect URI so Entra can send staff back there after sign-out (`post_logout_redirect_uri`).
- Front-channel logout URL: `https://reach-production-aef1.up.railway.app/api/auth/logout`
- Leave ID tokens and access tokens (implicit) unticked.
- Delegated Microsoft Graph permissions: `openid`, `profile`, `email`, `User.Read`. Grant admin consent.
- Token configuration → optional ID token claim: `email` (turn on the Microsoft Graph email permission if asked).
- Manifest → `optionalClaims.idToken`: `{ "name": "amr", "essential": false }`.
- Enterprise application → Properties → **Assignment required = Yes**. Assign the Reach users group (or each person, if the tenant has no group assignment).
- Leave security defaults enabled in the Entra admin centre (Identity → Overview → Properties → Manage security defaults). That is the MFA control for this tenant.

Issuer: `https://login.microsoftonline.com/<tenant-id>/v2.0` for the libertyhomerehab.com tenant. `https://login.microsoftonline.com/libertyhomerehab.com/v2.0` is the same single-tenant issuer.

The app uses the authorization-code flow with PKCE (`openid-client` v6), scopes `openid profile email`, and checks `iss`, `aud`, `tid`, `nonce`, and `exp`. The first successful sign-in stores the Microsoft `oid` on the staff row.

Matching is the work email, case-insensitive, and only `@libertyhomerehab.com`. `preferred_username`, `email`, and `upn` are all checked. Addresses ending in `@liberty.local` are never matched. Entra **Assignment required** still applies in the tenant. Reach then refuses anyone who is not on the confirmed staff list, with a page that says the account is not on that list.

## Confirmed staff

Only these eight people are provisioned. The role on the list is applied at sign-in. The display name is the ID token `name` as Microsoft sent it. The names below are the fallback when that claim is empty.

| Email | Role | What they see |
| --- | --- | --- |
| vincent@libertyhomerehab.com | executive | Full Reach, including creditors and money pages. Local password while `AUTH_PROVIDER=both`. |
| morgane@libertyhomerehab.com | executive | Same as Vincent, including the local password while `AUTH_PROVIDER=both`. |
| mel@libertyhomerehab.com | executive | Full Reach. Microsoft only. |
| sinead@libertyhomerehab.com | finance | Accounts, invoices, and creditors. |
| jenna@libertyhomerehab.com | finance | Accounts, invoices, and creditors. |
| mmapule@libertyhomerehab.com | admissions_manager | Admissions pipeline plus the Executive dashboard. Display name fallback **Mmapule Mohajane**. No creditors and no money pages. |
| cindy@libertyhomerehab.com | admissions | Admissions pipeline only. Display name fallback **Cindy De Smidt**. No money pages. |
| thembani@libertyhomerehab.com | admissions | House manager. Admissions pipeline only. No money pages. |

`admissions_manager` does not see Staff admin or lead forms. Creditor pages, creditor server actions, creditor creates, updates, deletes, accounting pull, and the profit-and-loss strip all check the role on the server. Hiding the nav link is not the control.

A new row gets a random password hash that cannot be used to sign in. Vincent and Morgane can be given a real password with `npm run user:set-password` after their row exists. That password works on `/login` only when `AUTH_PROVIDER=both`. `entra` refuses every password. `/login/emergency` is unchanged and still needs `REACH_BREAKGLASS_EMAIL` and `REACH_BREAKGLASS_PASSWORD_HASH`.

## Railway variable names

Set these on the Reach service. Do not put the secret values in git or chat.

- `AUTH_PROVIDER` — `both` for the trial, then `entra`
- `AUTH_MICROSOFT_ENTRA_ID_ID` — Application (client) ID
- `AUTH_MICROSOFT_ENTRA_ID_SECRET` — client secret value
- `AUTH_MICROSOFT_ENTRA_ID_ISSUER` — `https://login.microsoftonline.com/<tenant-id>/v2.0`
- `AUTH_REQUIRE_MFA` — leave unset. Must stay off under security defaults. `true` would reject most sign-ins because `amr` will not include `mfa`.
- `REACH_PUBLIC_URL` — `https://reach-production-aef1.up.railway.app`
- `REACH_BREAKGLASS_EMAIL` — email of an existing Reach user with role `executive`
- `REACH_BREAKGLASS_PASSWORD_HASH` — output of `scripts/hash-breakglass.ts` (`scrypt$salt$hash`)
- `REACH_SECRET` — already set. Rotate it on the day passwords are turned off.

`REACH_PUBLIC_URL` is the redirect URI origin. The callback is always `{REACH_PUBLIC_URL}/api/auth/callback/microsoft-entra-id`.

Break-glass hash, from a machine that will not keep the password in shell history:

```sh
printf '%s' 'the-emergency-password' | npx tsx scripts/hash-breakglass.ts
```

Paste only the printed line into `REACH_BREAKGLASS_PASSWORD_HASH`. `/login/emergency` returns 404 until both break-glass variables are set. It allows 5 attempts per 15 minutes, opens a 1-hour session, and writes an audit row for every attempt. A red banner shows on that session.

## Staff

Executive → **Staff** (`/staff`) adds a person (name, email, role), changes a role, disables sign-in, or unlinks Microsoft. Microsoft sign-in still only succeeds for the eight confirmed emails. A row added here for anyone else does not grant Reach. Disabling one of the eight stops their sign-in. Demo `@liberty.local` rows are kept for history; Microsoft cannot sign in as them.

`db:seed` never rewrites an existing staff password. While `AUTH_PROVIDER` is `both` or `entra`, it also does not insert missing demo staff. In `demo`, a missing staff row is created with the known password only when demo login is on; otherwise the new row gets a random password. Other demo data is unchanged. Passwords are set with `npm run user:set-password`. Password sign-in is limited to 5 failures per 15 minutes per address and email.

## Sessions

The `reach_session` cookie is `userId.iat.exp.method.HMAC`.

| Method | Lifetime |
| --- | --- |
| Microsoft | 12 hours |
| Break-glass | 1 hour |
| Password (`demo`, and the password form while `both`) | 14 days |

The previous `userId.HMAC` cookie still works in `demo` and `both`. It is rejected in `entra`. Rotating `REACH_SECRET` ends every existing session.

Sign-in and sign-out are written to the audit log. Microsoft rows include the `amr` value even when it is only `pwd` or empty. That record is how operators see when Microsoft actually challenged MFA. It is not a gate while `AUTH_REQUIRE_MFA` is off.

`/api/session/clear` still clears a broken cookie.

## Routes that stay open without a staff session

These keep their current checks when `AUTH_PROVIDER=entra`:

- `/f/<slug>`, `/f/<slug>/embed` (frame-ancestors CSP), `/f/<slug>/thanks`
- `/api/lead-forms/<slug>/script` and `/submit` (Turnstile on submit)
- `/api/webhooks/meta-leads` (signature) and `/api/webhooks/google-ads-leads` (key)
- `/privacy`
- `/api/documents/<id>` with `REACH_WITHIN_HANDOFF_SECRET`
- Send to Within and the Within occupancy read (outbound Bearer)
- `withinPackUrl` iPad links (Within token, unchanged)
- `/admit/ipad` stays staff-only
- `/login` still returns 200 when signed out (Railway healthcheck)

## Rollout

1. **1 Oct:** `AUTH_PROVIDER=both`, break-glass variables set, `AUTH_REQUIRE_MFA` left unset. Staff can use Microsoft. Passwords still work. Security defaults stay on in Entra.
2. **Before 1 Nov:** each of the eight staff signs in with Microsoft once so the row is provisioned and the `oid` is stored. Set Vincent and Morgane's local passwords if the trial still needs them.
3. **1 Nov:** `AUTH_PROVIDER=entra` and rotate `REACH_SECRET`. Password sessions end. Staff sign in with Microsoft.

Rollback: set `AUTH_PROVIDER` back to `both` (or `demo`) and redeploy. Break-glass keeps working in every mode once its variables are set.
