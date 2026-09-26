import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "reach-auth-"));
process.env.REACH_DB_PATH = path.join(dir, "reach.db");
process.env.AUTH_PROVIDER = "demo";
process.env.REACH_SECRET = "auth-assert-secret";
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
delete process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
delete process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
delete process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
delete process.env.AUTH_REQUIRE_MFA;
delete process.env.REACH_BREAKGLASS_EMAIL;
delete process.env.REACH_BREAKGLASS_PASSWORD_HASH;
delete process.env.REACH_PUBLIC_URL;
delete process.env.REACH_DEMO_LOGIN;

export const authAssertDir = dir;
