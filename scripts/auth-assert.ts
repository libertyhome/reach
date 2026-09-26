import "./auth-assert-setup";
import assert from "assert";
import { spawnSync } from "child_process";
import { createHash, createSign, generateKeyPairSync, type KeyObject } from "crypto";
import http from "http";
import { rmSync } from "fs";
import { NextRequest } from "next/server";
import { GET as clearSession } from "../src/app/api/session/clear/route";
import { GET as documentGet } from "../src/app/api/documents/[id]/route";
import { GET as leadScript } from "../src/app/api/lead-forms/[slug]/script/route";
import { POST as leadSubmit } from "../src/app/api/lead-forms/[slug]/submit/route";
import { POST as googleLeads } from "../src/app/api/webhooks/google-ads-leads/route";
import { POST as metaLeads } from "../src/app/api/webhooks/meta-leads/route";
import { middleware } from "../src/middleware";
import { authAssertDir } from "./auth-assert-setup";
import {
  assertAuthStartup,
  authProvider,
  loginPageModel,
  mfaRequired,
  microsoftRedirectUri,
} from "../src/lib/auth-mode";
import { assertProductionSessionSecret } from "../src/lib/session-secret";
import {
  issueLegacySessionToken,
  issueSessionToken,
  localPasswordRefusal,
  login,
  readSessionToken,
  SESSION_TTL_SECONDS,
} from "../src/lib/auth";
import { listAudit } from "../src/lib/audit";
import { attemptBreakglass, breakglassConfigured } from "../src/lib/breakglass";
import { canManageStaff, canSendToWithin, canViewCreditors, canViewExecutive, canViewMoneyPages } from "../src/lib/access";
import {
  createCreditor,
  deleteCreditor,
  getCreditor,
  loadCreditorView,
  pullAccounting,
  updateCreditor,
} from "../src/lib/creditors";
import { getDb } from "../src/lib/db";
import { beginMicrosoftSignIn, completeMicrosoftSignIn, readOidcTransaction, resetMicrosoftClient } from "../src/lib/entra";
import { withinPackUrl } from "../src/lib/handoff";
import { saveLeadForm } from "../src/lib/lead-forms";
import { verifyBreakglassHash } from "../src/lib/passwords";
import { findPersonByName } from "../src/lib/people";
import { REACH_STAFF, allowsBreakglassPassword } from "../src/lib/reach-staff";
import { resetAuthAttempts } from "../src/lib/rate-limit";
import { seed, seedIfEmpty } from "../src/lib/seed";
import { sessionTokenAccepted, sessionTokenLooksValid } from "../src/lib/session";
import { authenticate, createStaffUser, findUserByEmail, linkMicrosoftSignIn, setStaffDisabled, updateStaffLogin } from "../src/lib/users";
import { postAwaitingAdmission } from "../src/lib/within-send";
import { readHouseOccupancy } from "../src/lib/within-occupancy";

const TENANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CLIENT_ID = "reach-test-client";
const CLIENT_SECRET = "reach-test-secret";

function withEnv(values: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) previous[key] = process.env[key];
  const apply = (source: Record<string, string | undefined>) => {
    for (const key of Object.keys(source)) {
      if (source[key] === undefined) delete process.env[key];
      else process.env[key] = source[key];
    }
  };
  apply(values);
  const finish = () => apply(previous);
  try {
    const result = run();
    if (result && typeof (result as Promise<void>).then === "function") return (result as Promise<void>).finally(finish);
    finish();
    return result;
  } catch (error) {
    finish();
    throw error;
  }
}

function codeHash(code: string) {
  const digest = createHash("sha256").update(code).digest();
  return digest.subarray(0, digest.length / 2).toString("base64url");
}

function signJwt(payload: Record<string, unknown>, privateKey: KeyObject) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "reach-test" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const signature = createSign("RSA-SHA256").update(data).sign(privateKey).toString("base64url");
  return `${data}.${signature}`;
}

async function main() {
  await withEnv({ AUTH_PROVIDER: undefined, AUTH_REQUIRE_MFA: undefined }, () => {
    assert.strictEqual(authProvider(), "demo");
    assert.strictEqual(mfaRequired(), false);
  });
  await withEnv({ AUTH_REQUIRE_MFA: "false" }, () => {
    assert.strictEqual(mfaRequired(), false);
  });
  await withEnv({ AUTH_REQUIRE_MFA: "true" }, () => {
    assert.strictEqual(mfaRequired(), true);
  });
  await withEnv({ AUTH_PROVIDER: "BOTH" }, () => {
    assert.strictEqual(authProvider(), "both");
  });
  await withEnv({ AUTH_PROVIDER: "entra" }, () => {
    assert.strictEqual(authProvider(), "entra");
  });
  await withEnv({ AUTH_PROVIDER: "nope" }, () => {
    assert.throws(() => assertAuthStartup(), /demo, both, or entra/);
    assert.strictEqual(authProvider(), "entra");
  });
  await withEnv({ NODE_ENV: "production", AUTH_PROVIDER: "entra", REACH_SECRET: undefined }, () => {
    assert.throws(() => assertProductionSessionSecret(), /Refusing to start/);
    assert.doesNotThrow(() => assertAuthStartup());
  });
  await withEnv({ NODE_ENV: "production", AUTH_PROVIDER: "demo", REACH_SECRET: undefined }, () => {
    assert.throws(() => assertProductionSessionSecret(), /Refusing to start/);
    assert.doesNotThrow(() => assertAuthStartup());
  });
  await withEnv({ NODE_ENV: "production", AUTH_PROVIDER: "entra", REACH_SECRET: "auth-assert-secret" }, () => {
    assert.doesNotThrow(() => assertAuthStartup());
    assert.doesNotThrow(() => assertProductionSessionSecret());
  });

  process.env.AUTH_PROVIDER = "demo";
  seed();
  const demoModel = loginPageModel();
  assert.strictEqual(demoModel.provider, "demo");
  assert.strictEqual(demoModel.demoList, true);
  assert.strictEqual(demoModel.prefill, true);
  assert.strictEqual(demoModel.password, true);
  assert.strictEqual(demoModel.microsoft, false);
  assert.match(demoModel.note, /Production sign-in will be Microsoft 365 with MFA/);
  assert.ok(authenticate("admissions@liberty.local", "liberty"), "demo password still works");
  await withEnv({ REACH_DEMO_LOGIN: "false" }, () => {
    const hidden = loginPageModel();
    assert.strictEqual(hidden.password, true);
    assert.strictEqual(hidden.demoList, false);
    assert.strictEqual(hidden.prefill, false);
  });

  const issuedAt = 1_700_000_000_000;
  const demoToken = issueSessionToken("user_admissions", "demo", issuedAt);
  const demoSession = readSessionToken(demoToken, issuedAt + 1000);
  assert.ok(demoSession?.iat != null && demoSession.exp != null);
  assert.strictEqual(demoSession.exp - demoSession.iat, SESSION_TTL_SECONDS.demo);
  const microsoftToken = issueSessionToken("user_admissions", "microsoft", issuedAt);
  const microsoftSession = readSessionToken(microsoftToken, issuedAt + 1000);
  assert.ok(microsoftSession?.iat != null && microsoftSession.exp != null);
  assert.strictEqual(microsoftSession.exp - microsoftSession.iat, SESSION_TTL_SECONDS.microsoft);
  const breakToken = issueSessionToken("user_executive", "breakglass", issuedAt);
  const breakSession = readSessionToken(breakToken, issuedAt + 1000);
  assert.ok(breakSession?.iat != null && breakSession.exp != null);
  assert.strictEqual(breakSession.exp - breakSession.iat, SESSION_TTL_SECONDS.breakglass);
  assert.strictEqual(sessionTokenLooksValid(demoToken), true);
  assert.strictEqual(sessionTokenLooksValid("user_accounts." + "ab".repeat(32)), true);
  assert.strictEqual(sessionTokenLooksValid("broken"), false);

  const legacy = issueLegacySessionToken("user_executive");
  await withEnv({ AUTH_PROVIDER: "entra" }, () => {
    assert.strictEqual(sessionTokenLooksValid(legacy), true);
    assert.strictEqual(sessionTokenAccepted(legacy), false);
    assert.strictEqual(readSessionToken(legacy), null);
    assert.strictEqual(sessionTokenAccepted(microsoftToken, issuedAt + 1000), true);
  });
  await withEnv({ AUTH_PROVIDER: "both" }, () => {
    assert.strictEqual(readSessionToken(legacy)?.userId, "user_executive");
  });
  await withEnv({ AUTH_PROVIDER: "demo" }, () => {
    assert.strictEqual(readSessionToken(legacy)?.method, "demo");
  });

  const beforeReset = getDb()
    .prepare(`SELECT password_hash FROM users WHERE email = ?`)
    .get("therapist@liberty.local") as { password_hash: string };
  getDb().prepare(`UPDATE users SET password_hash = ? WHERE email = ?`).run("deadbeef", "therapist@liberty.local");
  await withEnv({ AUTH_PROVIDER: "both" }, () => {
    seed();
    seedIfEmpty();
  });
  await withEnv({ AUTH_PROVIDER: "entra" }, () => {
    seed();
    seedIfEmpty();
  });
  const kept = getDb()
    .prepare(`SELECT password_hash FROM users WHERE email = ?`)
    .get("therapist@liberty.local") as { password_hash: string };
  assert.strictEqual(kept.password_hash, "deadbeef", "both/entra seed must not reset passwords");
  getDb().prepare(`DELETE FROM users WHERE email = ?`).run("finance@liberty.local");
  await withEnv({ AUTH_PROVIDER: "entra" }, () => {
    seedIfEmpty();
    assert.strictEqual(findUserByEmail("finance@liberty.local"), null);
  });
  process.env.AUTH_PROVIDER = "demo";
  seed();
  const stillDead = getDb()
    .prepare(`SELECT password_hash FROM users WHERE email = ?`)
    .get("therapist@liberty.local") as { password_hash: string };
  assert.strictEqual(stillDead.password_hash, "deadbeef", "demo seed must not reset an existing password");
  getDb().prepare(`DELETE FROM users WHERE email = ?`).run("therapist@liberty.local");
  seed();
  const restored = getDb()
    .prepare(`SELECT password_hash FROM users WHERE email = ?`)
    .get("therapist@liberty.local") as { password_hash: string };
  assert.notStrictEqual(restored.password_hash, "deadbeef");
  assert.notStrictEqual(restored.password_hash, beforeReset.password_hash);
  assert.ok(authenticate("therapist@liberty.local", "liberty"));
  assert.ok(findUserByEmail("finance@liberty.local"));

  const configured = {
    AUTH_PROVIDER: "entra",
    AUTH_MICROSOFT_ENTRA_ID_ID: CLIENT_ID,
    AUTH_MICROSOFT_ENTRA_ID_SECRET: CLIENT_SECRET,
    AUTH_MICROSOFT_ENTRA_ID_ISSUER: `https://login.microsoftonline.com/${TENANT}/v2.0`,
  };
  await withEnv(configured, async () => {
    const refused = await login("executive@liberty.local", "liberty");
    assert.strictEqual(refused.ok, false);
    if (!refused.ok) assert.strictEqual(refused.reason, "password_disabled");
    const model = loginPageModel();
    assert.strictEqual(model.password, false);
    assert.strictEqual(model.microsoft, true);
    assert.strictEqual(model.demoList, false);
    assert.strictEqual(model.notConfigured, false);
  });
  await withEnv({ AUTH_PROVIDER: "entra" }, async () => {
    const closed = await login("executive@liberty.local", "liberty");
    assert.strictEqual(closed.ok, false);
    if (!closed.ok) assert.strictEqual(closed.reason, "not_configured");
    assert.strictEqual(loginPageModel().notConfigured, true);
    assert.strictEqual(loginPageModel().password, false);
  });
  await withEnv({ ...configured, AUTH_PROVIDER: "both" }, () => {
    const model = loginPageModel();
    assert.strictEqual(model.password, true);
    assert.strictEqual(model.microsoft, true);
    assert.strictEqual(model.demoList, false);
    assert.strictEqual(model.prefill, false);
    assert.match(model.note, /Vincent and Morgane/);
  });

  assert.strictEqual(breakglassConfigured(), false);
  const emergencyPage = (await import("../src/app/login/emergency/page")).default;
  await assert.rejects(() => emergencyPage({ searchParams: Promise.resolve({}) }));
  const emergencyPassword = "emergency-secret";
  const hashed = spawnSync("npx", ["tsx", "scripts/hash-breakglass.ts"], {
    input: `${emergencyPassword}\n`,
    encoding: "utf8",
  });
  assert.strictEqual(hashed.status, 0, hashed.stderr);
  assert.strictEqual(verifyBreakglassHash(emergencyPassword, hashed.stdout.trim()), true);
  await withEnv(
    {
      REACH_BREAKGLASS_EMAIL: "executive@liberty.local",
      REACH_BREAKGLASS_PASSWORD_HASH: hashed.stdout.trim(),
    },
    async () => {
      assert.strictEqual(breakglassConfigured(), true);
      resetAuthAttempts("breakglass:");
      const wrong = attemptBreakglass({ email: "executive@liberty.local", password: "nope" });
      assert.strictEqual(wrong.ok, false);
      if (!wrong.ok) assert.strictEqual(wrong.reason, "invalid");
      const wrongAudit = getDb()
        .prepare(`SELECT summary FROM audit_events WHERE action = 'sign_in' AND summary LIKE 'Break-glass%'`)
        .all() as { summary: string }[];
      assert.ok(wrongAudit.some((row) => row.summary.includes("wrong")));
      for (let i = 0; i < 4; i += 1) attemptBreakglass({ email: "executive@liberty.local", password: "nope" });
      const limited = attemptBreakglass({ email: "executive@liberty.local", password: emergencyPassword });
      assert.strictEqual(limited.ok, false);
      if (!limited.ok) assert.strictEqual(limited.reason, "rate_limited");
      resetAuthAttempts("breakglass:");
      const success = attemptBreakglass({ email: "executive@liberty.local", password: emergencyPassword });
      assert.strictEqual(success.ok, true);
      if (success.ok) {
        assert.strictEqual(success.user.role, "executive");
        const token = issueSessionToken(success.user.id, "breakglass", issuedAt);
        const parsed = readSessionToken(token, issuedAt + 1000);
        assert.strictEqual(parsed?.method, "breakglass");
        assert.strictEqual(parsed!.exp! - parsed!.iat!, 3600);
      }
    },
  );

  const local = linkMicrosoftSignIn({
    oid: "oid-local",
    emails: ["Therapist@Liberty.Local"],
    amr: ["pwd", "mfa"],
  });
  assert.strictEqual(local.ok, false);
  if (!local.ok) assert.strictEqual(local.reason, "unknown");
  assert.strictEqual(findUserByEmail("therapist@liberty.local")?.entra_oid ?? null, null);

  const created = createStaffUser({
    name: "Asha Nurse",
    email: "asha@libertyhomerehab.com",
    role: "admissions",
    actorId: "user_executive",
  });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(authenticate("asha@libertyhomerehab.com", "liberty"), null);

  let oidcServer: http.Server | null = null;
  try {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = keys.publicKey.export({ format: "jwk" }) as Record<string, string>;
  jwk.kid = "reach-test";
  jwk.alg = "RS256";
  jwk.use = "sig";
  let issuedToken = "";
  oidcServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const bodyChunks: Buffer[] = [];
    for await (const chunk of req) bodyChunks.push(chunk as Buffer);
    void Buffer.concat(bodyChunks);
    if (url.pathname.endsWith("/jwks")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (url.pathname.endsWith("/token")) {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.end(
        JSON.stringify({
          access_token: "test-access",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid profile email",
          id_token: issuedToken,
        }),
      );
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end("{}");
  });
  if (!oidcServer) throw new Error("OIDC mock failed to start");
  const server = oidcServer;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = oidcServer.address();
  if (!address || typeof address === "string") throw new Error("OIDC mock failed to bind");
  const issuer = `http://127.0.0.1:${address.port}/${TENANT}/v2.0`;
  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    end_session_endpoint: `${issuer}/logout`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "profile", "email"],
  };
  oidcServer.removeAllListeners("request");
  oidcServer.on("request", async (req, res) => {
    const url = new URL(req.url || "/", issuer);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    void Buffer.concat(chunks);
    if (url.pathname.endsWith("openid-configuration")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(metadata));
      return;
    }
    if (url.pathname.endsWith("/jwks")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (url.pathname.endsWith("/token")) {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.end(
        JSON.stringify({
          access_token: "test-access",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid profile email",
          id_token: issuedToken,
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  const redirectUri = microsoftRedirectUri("http://127.0.0.1:9");
  const nowSeconds = Math.floor(Date.now() / 1000);
  async function callbackCase(
    overrides: Record<string, unknown>,
    options?: { email?: string; oid?: string; name?: string },
  ) {
    resetMicrosoftClient();
    const started = await beginMicrosoftSignIn({ next: "/enquiries", redirectUri });
    assert.strictEqual(started.ok, true);
    if (!started.ok) return { ok: false as const, reason: "verify" as const };
    const transaction = readOidcTransaction(started.cookie);
    assert.ok(transaction);
    const code = `code-${Math.random().toString(16).slice(2)}`;
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", transaction!.state);
    issuedToken = signJwt(
      {
        iss: issuer,
        aud: CLIENT_ID,
        sub: "subject-asha",
        oid: options?.oid ?? "oid-cindy",
        tid: TENANT,
        nonce: transaction!.nonce,
        iat: nowSeconds,
        exp: nowSeconds + 600,
        c_hash: codeHash(code),
        preferred_username: options?.email ?? "Cindy@LibertyHomeRehab.com",
        email: options?.email ?? "Cindy@LibertyHomeRehab.com",
        name: options?.name ?? "Cindy de Smidt",
        amr: ["pwd", "mfa"],
        ...overrides,
      },
      keys.privateKey,
    );
    return completeMicrosoftSignIn({ callbackUrl, transaction: transaction! });
  }

  await withEnv(
    {
      AUTH_PROVIDER: "entra",
      AUTH_MICROSOFT_ENTRA_ID_ID: CLIENT_ID,
      AUTH_MICROSOFT_ENTRA_ID_SECRET: CLIENT_SECRET,
      AUTH_MICROSOFT_ENTRA_ID_ISSUER: issuer,
      AUTH_REQUIRE_MFA: "true",
    },
    async () => {
      const good = await callbackCase({});
      assert.strictEqual(good.ok, true, JSON.stringify(good));
      if (good.ok) assert.ok(good.amr.includes("mfa"));
      const cindy = findUserByEmail("cindy@libertyhomerehab.com");
      assert.strictEqual(cindy?.entra_oid, "oid-cindy");
      assert.strictEqual(cindy?.role, "admissions");
      assert.strictEqual(cindy?.name, "Cindy de Smidt", "Microsoft spelling is stored as sent");
      assert.notStrictEqual(cindy?.name, "Cindy De Smidt");
      const audits = listAudit("oid-asha").length
        ? listAudit("oid-asha")
        : (getDb().prepare(`SELECT summary FROM audit_events WHERE action = 'sign_in'`).all() as { summary: string }[]);
      assert.ok(audits.some((row) => row.summary.includes("amr:")));

      const wrongTenant = await callbackCase({ tid: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff" });
      assert.strictEqual(wrongTenant.ok, false);
      if (!wrongTenant.ok) assert.strictEqual(wrongTenant.reason, "tenant");

      const wrongAud = await callbackCase({ aud: "some-other-app" });
      assert.strictEqual(wrongAud.ok, false);
      if (!wrongAud.ok) assert.strictEqual(wrongAud.reason, "audience");

      const badNonce = await callbackCase({ nonce: "not-the-nonce" });
      assert.strictEqual(badNonce.ok, false);
      if (!badNonce.ok) assert.strictEqual(badNonce.reason, "nonce");

      const noMfa = await callbackCase({ amr: ["pwd"] });
      assert.strictEqual(noMfa.ok, false);
      if (!noMfa.ok) assert.strictEqual(noMfa.reason, "mfa");

      process.env.AUTH_REQUIRE_MFA = "false";
      const mfaOptional = await callbackCase({ amr: ["pwd"] });
      assert.strictEqual(mfaOptional.ok, true, JSON.stringify(mfaOptional));

      const conflict = linkMicrosoftSignIn({
        oid: "oid-other",
        emails: ["cindy@libertyhomerehab.com"],
        amr: ["mfa"],
      });
      assert.strictEqual(conflict.ok, false);
      if (!conflict.ok) assert.strictEqual(conflict.reason, "conflict");

      const unknown = await callbackCase(
        { oid: "oid-stranger", name: "Stranger" },
        { email: "stranger@libertyhomerehab.com", oid: "oid-stranger", name: "Stranger" },
      );
      assert.strictEqual(unknown.ok, false);
      if (!unknown.ok) assert.strictEqual(unknown.reason, "unlisted");
      assert.strictEqual(findUserByEmail("stranger@libertyhomerehab.com"), null);

      const ashaSignIn = await callbackCase(
        { oid: "oid-asha", name: "Asha Nurse" },
        { email: "asha@libertyhomerehab.com", oid: "oid-asha", name: "Asha Nurse" },
      );
      assert.strictEqual(ashaSignIn.ok, false);
      if (!ashaSignIn.ok) assert.strictEqual(ashaSignIn.reason, "unlisted");
      assert.strictEqual(findUserByEmail("asha@libertyhomerehab.com")?.entra_oid ?? null, null);

      const manager = linkMicrosoftSignIn({
        oid: "oid-mmapule",
        emails: ["Mmapule@LibertyHomeRehab.com"],
        amr: ["pwd"],
        name: "Mmapule Mohajane",
      });
      assert.strictEqual(manager.ok, true, JSON.stringify(manager));
      if (manager.ok) {
        assert.strictEqual(manager.provisioned, true);
        assert.strictEqual(manager.user.role, "admissions_manager");
        assert.strictEqual(manager.user.name, "Mmapule Mohajane");
        assert.strictEqual(canViewExecutive(manager.user), true);
        assert.strictEqual(canViewCreditors(manager.user), false);
        assert.strictEqual(canViewMoneyPages(manager.user), false);
        assert.strictEqual(canManageStaff(manager.user), false);
        assert.strictEqual(canSendToWithin(manager.user), true);
        const view = loadCreditorView(manager.user);
        assert.strictEqual(view.ok, false);
        const executive = findUserByEmail("executive@liberty.local");
        assert.ok(executive);
        const created = createCreditor(
          {
            name: "Auth Supplier",
            facility: "lodge",
            contactName: "",
            email: "",
            phone: "",
            accountReference: "",
            notes: "",
          },
          executive.id,
        );
        assert.strictEqual(created.ok, true);
        if (created.ok) {
          const deniedCreate = createCreditor(
            {
              name: "Auth Denied Supplier",
              facility: "lodge",
              contactName: "",
              email: "",
              phone: "",
              accountReference: "",
              notes: "",
            },
            manager.user.id,
          );
          assert.strictEqual(deniedCreate.ok, false);
          assert.strictEqual(getCreditor(created.creditor.id)?.name, "Auth Supplier");
          const deniedUpdate = updateCreditor(
            created.creditor.id,
            {
              name: "Auth Hijack",
              facility: "lodge",
              contactName: "",
              email: "",
              phone: "",
              accountReference: "",
              notes: "",
            },
            manager.user.id,
          );
          assert.strictEqual(deniedUpdate.ok, false);
          assert.strictEqual(getCreditor(created.creditor.id)?.name, "Auth Supplier");
          const deniedDelete = deleteCreditor(created.creditor.id, manager.user.id);
          assert.strictEqual(deniedDelete.ok, false);
          assert.ok(getCreditor(created.creditor.id));
          const deniedPull = pullAccounting(manager.user.id);
          assert.strictEqual(deniedPull.ok, false);
          assert.strictEqual(deniedPull.imported, 0);
          getDb().prepare(`DELETE FROM creditors WHERE id = ?`).run(created.creditor.id);
        }
      }

      const fallback = linkMicrosoftSignIn({
        oid: "oid-thembani",
        emails: ["THEMBANI@libertyhomerehab.com"],
        amr: ["pwd"],
      });
      assert.strictEqual(fallback.ok, true, JSON.stringify(fallback));
      if (fallback.ok) {
        assert.strictEqual(fallback.user.role, "admissions");
        assert.strictEqual(fallback.user.email, "thembani@libertyhomerehab.com");
        assert.strictEqual(canViewMoneyPages(fallback.user), false);
        assert.strictEqual(canViewExecutive(fallback.user), false);
        assert.strictEqual(canViewCreditors(fallback.user), false);
      }
      const spelled = linkMicrosoftSignIn({
        oid: "oid-sinead",
        emails: ["Sinead@LibertyHomeRehab.com"],
        amr: ["pwd"],
        name: "Sinéad",
      });
      assert.strictEqual(spelled.ok, true, JSON.stringify(spelled));
      if (spelled.ok) {
        assert.strictEqual(spelled.user.role, "finance");
        assert.strictEqual(spelled.user.name, "Sinéad");
        assert.strictEqual(canViewCreditors(spelled.user), true);
      }

      const wrongRole = createStaffUser({
        name: "Wrong Role",
        email: "jenna@libertyhomerehab.com",
        role: "therapist",
        actorId: "user_executive",
      });
      assert.strictEqual(wrongRole.ok, true);
      const corrected = linkMicrosoftSignIn({
        oid: "oid-jenna",
        emails: ["jenna@libertyhomerehab.com"],
        amr: ["pwd"],
        name: "Jenna",
      });
      assert.strictEqual(corrected.ok, true, JSON.stringify(corrected));
      if (corrected.ok) {
        assert.strictEqual(corrected.provisioned, false);
        assert.strictEqual(corrected.user.role, "finance");
        assert.strictEqual(corrected.user.name, "Jenna");
      }

      assert.strictEqual(REACH_STAFF.length, 8);
      for (const grant of REACH_STAFF) {
        const row = findUserByEmail(grant.email);
        if (grant.email === "vincent@libertyhomerehab.com" || grant.email === "morgane@libertyhomerehab.com" || grant.email === "mel@libertyhomerehab.com") {
          continue;
        }
        assert.ok(row, grant.email);
        assert.strictEqual(row?.role, grant.role, grant.email);
      }
      for (const email of ["vincent@libertyhomerehab.com", "morgane@libertyhomerehab.com", "mel@libertyhomerehab.com"]) {
        const linked = linkMicrosoftSignIn({
          oid: `oid-${email}`,
          emails: [email],
          amr: ["pwd"],
          name: email.split("@")[0],
        });
        assert.strictEqual(linked.ok, true, email);
        if (linked.ok) assert.strictEqual(linked.user.role, "executive");
      }
      assert.strictEqual(allowsBreakglassPassword("Vincent@LibertyHomeRehab.com"), true);
      assert.strictEqual(allowsBreakglassPassword("morgane@libertyhomerehab.com"), true);
      assert.strictEqual(allowsBreakglassPassword("mel@libertyhomerehab.com"), false);

      if (corrected.ok) setStaffDisabled({ userId: corrected.user.id, disabled: true, actorId: "user_executive" });
      const disabled = await callbackCase(
        { oid: "oid-jenna", name: "Jenna" },
        { email: "jenna@libertyhomerehab.com", oid: "oid-jenna", name: "Jenna" },
      );
      assert.strictEqual(disabled.ok, false);
      if (!disabled.ok) assert.strictEqual(disabled.reason, "disabled");
    },
  );
  } finally {
    if (oidcServer) {
      await new Promise<void>((resolve) => oidcServer?.close(() => resolve()));
    }
  }

  const passwordSet = updateStaffLogin({
    email: "vincent@libertyhomerehab.com",
    password: "vincent-breakglass-pass",
  });
  assert.strictEqual(passwordSet.ok, true, JSON.stringify(passwordSet));
  await withEnv({ ...configured, AUTH_PROVIDER: "both" }, async () => {
    assert.strictEqual(localPasswordRefusal("Vincent@LibertyHomeRehab.com"), null);
    const allowed = authenticate("Vincent@LibertyHomeRehab.com", "vincent-breakglass-pass");
    assert.ok(allowed, "Vincent can use the local password while AUTH_PROVIDER=both");
    assert.strictEqual(allowed?.role, "executive");
    assert.strictEqual(localPasswordRefusal("morgane@libertyhomerehab.com"), null);
    const morgane = authenticate("morgane@libertyhomerehab.com", "vincent-breakglass-pass");
    assert.strictEqual(morgane, null, "Morgane is allowed to try a password, and a wrong one fails");
    const jenna = await login("jenna@libertyhomerehab.com", "vincent-breakglass-pass");
    assert.strictEqual(jenna.ok, false);
    if (!jenna.ok) assert.strictEqual(jenna.reason, "breakglass_only");
    const demo = await login("executive@liberty.local", "liberty");
    assert.strictEqual(demo.ok, false);
    if (!demo.ok) assert.strictEqual(demo.reason, "breakglass_only");
  });
  await withEnv({ ...configured, AUTH_PROVIDER: "entra" }, async () => {
    const refusedVincent = await login("vincent@libertyhomerehab.com", "vincent-breakglass-pass");
    assert.strictEqual(refusedVincent.ok, false);
    if (!refusedVincent.ok) assert.strictEqual(refusedVincent.reason, "password_disabled");
  });

  process.env.AUTH_PROVIDER = "entra";
  const savedForm = saveLeadForm({
    name: "QA auth form",
    slug: "qa-auth-form",
    leadSource: "google_com",
    campaign: "qa-auth",
    allowedDomains: "example.com",
    externalKey: "",
    privacyUrl: "/privacy",
    active: true,
  });
  assert.strictEqual(savedForm.ok, true);

  const scriptResponse = await leadScript(new Request("http://localhost/api/lead-forms/missing/script"), {
    params: Promise.resolve({ slug: "missing" }),
  });
  assert.strictEqual(scriptResponse.status, 404);

  const previousTurnstile = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = "turnstile-test";
  const submitResponse = await leadSubmit(
    new Request("http://localhost/api/lead-forms/qa-auth-form/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caller_name: "QA", phone: "0215550100" }),
    }),
    { params: Promise.resolve({ slug: "qa-auth-form" }) },
  );
  const submitBody = (await submitResponse.json()) as { error?: string };
  assert.strictEqual(submitResponse.status, 400);
  assert.strictEqual(submitBody.error, "turnstile");
  if (previousTurnstile === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = previousTurnstile;

  process.env.META_APP_SECRET = "meta-test-secret";
  const metaResponse = await metaLeads(
    new Request("http://localhost/api/webhooks/meta-leads", {
      method: "POST",
      body: "{}",
      headers: { "x-hub-signature-256": "sha256=00" },
    }),
  );
  const metaBody = (await metaResponse.json()) as { error?: string };
  assert.strictEqual(metaResponse.status, 401);
  assert.match(metaBody.error || "", /signature/i);
  delete process.env.META_APP_SECRET;

  process.env.GOOGLE_ADS_WEBHOOK_KEY = "google-test";
  const googleResponse = await googleLeads(
    new Request("http://localhost/api/webhooks/google-ads-leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  const googleBody = (await googleResponse.json()) as { error?: string };
  assert.strictEqual(googleResponse.status, 401);
  assert.match(googleBody.error || "", /google_key/i);
  delete process.env.GOOGLE_ADS_WEBHOOK_KEY;

  process.env.REACH_WITHIN_HANDOFF_SECRET = "handoff-test";
  const documentResponse = await documentGet(
    new Request("http://localhost/api/documents/missing", { headers: { authorization: "Bearer handoff-test" } }),
    { params: Promise.resolve({ id: "missing" }) },
  );
  assert.notStrictEqual(documentResponse.status, 401);
  assert.strictEqual(documentResponse.status, 404);
  delete process.env.REACH_WITHIN_HANDOFF_SECRET;

  const amelia = findPersonByName("Amelia", "Hart");
  assert.ok(amelia);
  const pack = withinPackUrl(amelia);
  assert.ok(pack);
  assert.match(pack, /\/admit-pack\//);
  assert.doesNotMatch(pack, /microsoft/i);

  let outboundAuth = "";
  await postAwaitingAdmission(
    {
      v: 2,
      intent: "awaiting_admission",
      reachClientId: amelia.id,
      house: "weltevreden_manor",
      phase: "1",
      admissionKind: "program",
      firstName: amelia.first_name,
      lastName: amelia.last_name,
      documentsComplete: false,
      sentBy: { name: "Executive Desk", email: "executive@liberty.local", reachUserId: "user_executive" },
      sentAt: new Date().toISOString(),
    },
    {
      baseUrl: "http://within.test",
      secret: "handoff-test",
      fetchImpl: async (_input, init) => {
        outboundAuth = new Headers(init?.headers).get("authorization") || "";
        return new Response(JSON.stringify({ code: "unreachable" }), { status: 503 });
      },
    },
  );
  assert.strictEqual(outboundAuth, "Bearer handoff-test");

  let occupancyAuth = "";
  await readHouseOccupancy("manor", {
    baseUrl: "http://within.test",
    secret: "handoff-test",
    fetchImpl: async (_input, init) => {
      occupancyAuth = new Headers(init?.headers).get("authorization") || "";
      return new Response("no", { status: 503 });
    },
  });
  assert.strictEqual(occupancyAuth, "Bearer handoff-test");

  const cleared = await clearSession(new Request("http://localhost/api/session/clear?next=/login"));
  assert.ok(cleared.status === 307 || cleared.status === 302 || cleared.status === 303);
  assert.match(cleared.headers.get("location") || "", /\/login$/);

  function run(pathname: string, cookie?: string) {
    const headers = new Headers();
    if (cookie) headers.set("cookie", `reach_session=${cookie}`);
    return middleware(new NextRequest(new URL(pathname, "http://localhost:3001"), { headers }));
  }
  assert.strictEqual(run("/login").status, 200);
  assert.strictEqual(run("/privacy").status, 200);
  assert.strictEqual(run("/f/qa-auth-form").status, 200);
  assert.strictEqual(run("/f/qa-auth-form").headers.get("content-security-policy"), "frame-ancestors 'self'");
  const embed = run("/f/qa-auth-form/embed");
  assert.strictEqual(embed.status, 200);
  assert.match(embed.headers.get("content-security-policy") || "", /frame-ancestors/);
  assert.strictEqual(run("/f/qa-auth-form/thanks").status, 200);
  assert.strictEqual(run("/admit/ipad").status, 307);
  assert.match(run("/admit/ipad").headers.get("location") || "", /\/login/);
  assert.strictEqual(run("/enquiries", legacy).status, 307);
  await withEnv({ AUTH_PROVIDER: "demo" }, () => {
    assert.strictEqual(run("/login").status, 200);
    assert.ok(authenticate("executive@liberty.local", "liberty"));
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(authAssertDir, { recursive: true, force: true });
  });
