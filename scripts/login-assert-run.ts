import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginScreen } from "../src/components/LoginScreen";
import { getDb } from "../src/lib/db";
import { demoLoginEnabled, loginPresentation } from "../src/lib/demo-login";
import {
  LOGIN_FAILURE_LIMIT,
  LOGIN_WINDOW_MS,
  clearLoginFailures,
  clientIp,
  isLoginRateLimited,
  recordLoginFailure,
  resetLoginRateLimit,
} from "../src/lib/login-rate-limit";
import { verifyPassword } from "../src/lib/passwords";
import { seed, seedIfEmpty } from "../src/lib/seed";
import { assertProductionSessionSecret, sessionSecret } from "../src/lib/session-secret";
import { authenticate, findUserByEmail, updateStaffLogin } from "../src/lib/users";
import { register } from "../src/instrumentation";

const TOO_SHORT = "short-secret";
const NEW_PASSWORD = "long-password!!";
const RENAMED_PASSWORD = "renamed-password";

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const key of Object.keys(previous)) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    const result = fn();
    if (result && typeof (result as { then?: unknown }).then === "function") {
      return Promise.resolve(result).finally(() => restoreEnv(previous)) as T;
    }
    restoreEnv(previous);
    return result;
  } catch (error) {
    restoreEnv(previous);
    throw error;
  }
}

function runNodeScript(script: string, args: string[], input: string, envPatch: Record<string, string | undefined> = {}) {
  const cli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const env = { ...process.env };
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return spawnSync(process.execPath, [cli, path.join(process.cwd(), script), ...args], {
    input,
    encoding: "utf8",
    env,
    cwd: process.cwd(),
  });
}

function assertOutputHides(output: string, secret: string) {
  assert.strictEqual(output.includes(secret), false, "command output must not include the password");
}

export async function runLoginAssertions() {
  assert.strictEqual(TOO_SHORT.length < 14, true);
  assert.strictEqual(NEW_PASSWORD.length >= 14, true);
  assert.strictEqual(RENAMED_PASSWORD.length >= 14, true);

  withEnv({ NODE_ENV: "development", REACH_DEMO_LOGIN: undefined }, () => {
    assert.strictEqual(demoLoginEnabled(), true);
  });
  withEnv({ NODE_ENV: "production", REACH_DEMO_LOGIN: undefined }, () => {
    assert.strictEqual(demoLoginEnabled(), false);
  });
  withEnv({ NODE_ENV: "production", REACH_DEMO_LOGIN: "true" }, () => {
    assert.strictEqual(demoLoginEnabled(), true);
  });
  withEnv({ NODE_ENV: "development", REACH_DEMO_LOGIN: "false" }, () => {
    assert.strictEqual(demoLoginEnabled(), false);
  });

  const hidden = loginPresentation(false);
  assert.deepStrictEqual(hidden.accounts, []);
  assert.deepStrictEqual(hidden.quickPicks, []);
  assert.strictEqual(hidden.prefillEmail, "");
  assert.strictEqual(hidden.prefillPassword, "");
  assert.strictEqual(hidden.demoHeading, "");
  const shown = loginPresentation(true);
  assert.strictEqual(shown.accounts.length, 5);
  assert.strictEqual(shown.prefillPassword, "liberty");
  assert.strictEqual(shown.prefillEmail, "admissions@liberty.local");

  const offHtml = renderToStaticMarkup(createElement(LoginScreen, { demo: false, nextPath: "" }));
  assert.strictEqual(offHtml.includes("liberty"), false, "demo off must not mention liberty");
  assert.strictEqual(offHtml.includes("@liberty.local"), false, "demo off must not list staff emails");
  assert.strictEqual(offHtml.includes("Demo staff"), false);
  assert.strictEqual(offHtml.includes("Sign in with your Reach staff account."), true);
  assert.strictEqual(offHtml.includes('value="liberty"'), false);
  assert.strictEqual(offHtml.includes(">Admissions<"), false);
  assert.strictEqual(offHtml.includes(">Therapist<"), false);

  const onHtml = renderToStaticMarkup(createElement(LoginScreen, { demo: true, nextPath: "" }));
  assert.strictEqual(onHtml.includes("Demo staff (password: liberty)"), true);
  assert.strictEqual(onHtml.includes("therapist@liberty.local"), true);
  assert.strictEqual(onHtml.includes("finance@liberty.local"), true);
  assert.strictEqual(onHtml.includes("executive@liberty.local"), true);
  assert.strictEqual(onHtml.includes('value="admissions@liberty.local"'), true);
  assert.strictEqual(onHtml.includes('value="liberty"'), true);
  assert.strictEqual(onHtml.includes(">Admissions<"), true);

  const formSource = readFileSync(path.join(process.cwd(), "src/components/LoginForm.tsx"), "utf8");
  const pageSource = readFileSync(path.join(process.cwd(), "src/app/login/page.tsx"), "utf8");
  assert.strictEqual(formSource.toLowerCase().includes("liberty"), false);
  assert.strictEqual(pageSource.toLowerCase().includes("liberty"), false);
  const actionSource = readFileSync(path.join(process.cwd(), "src/app/actions.ts"), "utf8");
  assert.strictEqual(actionSource.includes("isLoginRateLimited"), true);
  assert.strictEqual(actionSource.includes("recordLoginFailure"), true);
  assert.strictEqual(actionSource.includes("LOGIN_GENERIC_ERROR"), true);

  withEnv({ NODE_ENV: "production", REACH_SECRET: undefined, NEXT_PHASE: undefined }, () => {
    assert.throws(() => sessionSecret(), /REACH_SECRET is not set/);
    assert.throws(() => assertProductionSessionSecret(), /Refusing to start/);
  });
  await withEnv({ NODE_ENV: "production", REACH_SECRET: undefined, NEXT_PHASE: undefined }, async () => {
    await assert.rejects(() => register(), /Refusing to start/);
  });
  await withEnv(
    { NODE_ENV: "production", REACH_SECRET: undefined, NEXT_PHASE: "phase-production-build" },
    async () => {
      await register();
      assert.throws(() => sessionSecret(), /REACH_SECRET/);
    },
  );
  withEnv({ NODE_ENV: "production", REACH_SECRET: "   ", NEXT_PHASE: undefined }, () => {
    assert.throws(() => sessionSecret(), /REACH_SECRET/);
  });
  withEnv({ NODE_ENV: "production", REACH_SECRET: "prod-session-secret", NEXT_PHASE: undefined }, () => {
    assert.strictEqual(sessionSecret(), "prod-session-secret");
    assertProductionSessionSecret();
  });
  withEnv({ NODE_ENV: "development", REACH_SECRET: undefined, NEXT_PHASE: undefined }, () => {
    assert.strictEqual(sessionSecret(), "reach-liberty-home-demo-secret");
    assertProductionSessionSecret();
  });

  const refused = runNodeScript("scripts/require-secret.ts", [], "", {
    NODE_ENV: "production",
    REACH_SECRET: undefined,
  });
  assert.notStrictEqual(refused.status, 0);
  assert.match(`${refused.stderr}`, /Refusing to start/);
  assert.strictEqual(`${refused.stdout}${refused.stderr}`.includes("reach-liberty-home-demo-secret"), false);

  const allowed = runNodeScript("scripts/require-secret.ts", [], "", {
    NODE_ENV: "production",
    REACH_SECRET: "prod-session-secret",
  });
  assert.strictEqual(allowed.status, 0);
  assert.strictEqual(`${allowed.stdout}${allowed.stderr}`.includes("prod-session-secret"), false);

  resetLoginRateLimit();
  const now = Date.parse("2026-09-26T12:00:00.000Z");
  const ip = "203.0.113.10";
  const email = "executive@liberty.local";
  for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
    assert.strictEqual(isLoginRateLimited(ip, email, now), false);
    recordLoginFailure(ip, email, now + attempt);
  }
  assert.strictEqual(isLoginRateLimited(ip, email, now + 10), true, "rate limit triggers after 5 failures");
  assert.strictEqual(isLoginRateLimited("203.0.113.11", email, now + 10), false);
  assert.strictEqual(isLoginRateLimited(ip, "admissions@liberty.local", now + 10), false);
  assert.strictEqual(isLoginRateLimited(ip, email, now + LOGIN_WINDOW_MS), false);
  clearLoginFailures(ip, email);
  recordLoginFailure(ip, email, now);
  clearLoginFailures(ip, email);
  assert.strictEqual(isLoginRateLimited(ip, email, now), false);
  assert.strictEqual(
    clientIp({
      get(name: string) {
        if (name === "x-forwarded-for") return "203.0.113.5, 10.0.0.8";
        return null;
      },
    }),
    "203.0.113.5",
  );
  resetLoginRateLimit();

  withEnv({ REACH_DEMO_LOGIN: "true", NODE_ENV: "development" }, () => {
    getDb();
    seed();
    assert(authenticate("therapist@liberty.local", "liberty"), "demo on creates the known password");
    const updated = updateStaffLogin({
      email: "therapist@liberty.local",
      password: NEW_PASSWORD,
    });
    assert.strictEqual(updated.ok, true);
    const before = findUserByEmail("therapist@liberty.local");
    assert(before);
    seed();
    seedIfEmpty();
    const after = findUserByEmail("therapist@liberty.local");
    assert(after);
    assert.strictEqual(after.id, before.id);
    assert.strictEqual(after.password_hash, before.password_hash);
    assert.strictEqual(after.password_salt, before.password_salt);
    assert(authenticate("therapist@liberty.local", NEW_PASSWORD), "seed must not reset an existing password");
    assert.strictEqual(authenticate("therapist@liberty.local", "liberty"), null);

    const short = updateStaffLogin({ email: "accounts@liberty.local", password: TOO_SHORT });
    assert.strictEqual(short.ok, false);
    assert(authenticate("accounts@liberty.local", "liberty"));

    const clash = updateStaffLogin({
      email: "accounts@liberty.local",
      password: NEW_PASSWORD,
      emailNew: "finance@liberty.local",
    });
    assert.strictEqual(clash.ok, false);
    assert(authenticate("accounts@liberty.local", "liberty"));
  });

  withEnv({ REACH_DEMO_LOGIN: "false", NODE_ENV: "production", REACH_SECRET: "assert-only-secret" }, () => {
    const kept = findUserByEmail("admissions@liberty.local");
    assert(kept);
    const renamed = updateStaffLogin({
      email: "admissions@liberty.local",
      password: RENAMED_PASSWORD,
      name: "Kept Admissions",
    });
    assert.strictEqual(renamed.ok, true);
    seed();
    const still = findUserByEmail("admissions@liberty.local");
    assert(still);
    assert.strictEqual(still.name, "Kept Admissions");
    assert(authenticate("admissions@liberty.local", RENAMED_PASSWORD));
    assert.strictEqual(authenticate("admissions@liberty.local", "liberty"), null);

    getDb().prepare(`DELETE FROM users WHERE email = ?`).run("finance@liberty.local");
    getDb().prepare(`DELETE FROM users WHERE email = ?`).run("executive@liberty.local");
    seedIfEmpty();
    const finance = findUserByEmail("finance@liberty.local");
    const executive = findUserByEmail("executive@liberty.local");
    assert(finance && executive, "missing staff rows are recreated");
    assert.strictEqual(verifyPassword("liberty", finance.password_hash, finance.password_salt), false);
    assert.strictEqual(verifyPassword("liberty", executive.password_hash, executive.password_salt), false);
    assert.notStrictEqual(finance.password_hash, executive.password_hash);
    assert.strictEqual(authenticate("finance@liberty.local", "liberty"), null);
    assert.strictEqual(finance.id, "user_finance");
  });

  const missing = runNodeScript("scripts/set-password.ts", ["nobody@example.com"], `${NEW_PASSWORD}\n`);
  assert.notStrictEqual(missing.status, 0);
  assert.match(`${missing.stderr}`, /No staff account/);
  assertOutputHides(`${missing.stdout}${missing.stderr}`, NEW_PASSWORD);

  const tooShort = runNodeScript("scripts/set-password.ts", ["accounts@liberty.local"], `${TOO_SHORT}\n`);
  assert.notStrictEqual(tooShort.status, 0);
  assert.match(`${tooShort.stderr}`, /14/);
  assertOutputHides(`${tooShort.stdout}${tooShort.stderr}`, TOO_SHORT);
  assert(authenticate("accounts@liberty.local", "liberty"), "a rejected password does not change the account");

  const changed = runNodeScript("scripts/set-password.ts", ["accounts@liberty.local"], `${NEW_PASSWORD}\n`);
  assert.strictEqual(changed.status, 0, changed.stderr);
  assert.match(`${changed.stdout}`, /Updated/);
  assertOutputHides(`${changed.stdout}${changed.stderr}`, NEW_PASSWORD);
  assert(authenticate("accounts@liberty.local", NEW_PASSWORD));
  assert.strictEqual(authenticate("accounts@liberty.local", "liberty"), null);

  const renamed = runNodeScript(
    "scripts/set-password.ts",
    ["executive@liberty.local", "--name", "Alex Executive", "--email-new", "alex.executive@example.com"],
    `${RENAMED_PASSWORD}\n`,
  );
  assert.strictEqual(renamed.status, 0, renamed.stderr);
  assert.match(`${renamed.stdout}`, /Alex Executive <alex.executive@example.com>/);
  assertOutputHides(`${renamed.stdout}${renamed.stderr}`, RENAMED_PASSWORD);
  assert.strictEqual(authenticate("executive@liberty.local", "liberty"), null);
  assert.strictEqual(findUserByEmail("executive@liberty.local"), null);
  const alex = authenticate("alex.executive@example.com", RENAMED_PASSWORD);
  assert(alex);
  assert.strictEqual(alex.name, "Alex Executive");
  assert.strictEqual(alex.role, "executive");

  const help = runNodeScript("scripts/set-password.ts", ["--help"], "");
  assert.strictEqual(help.status, 0);
  assert.match(`${help.stdout}`, /stdin/);

  console.log("Login assertions passed.");
}
