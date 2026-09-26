const DEMO_SESSION_SECRET = "reach-liberty-home-demo-secret";

export function productionSecretError() {
  return "REACH_SECRET is not set. Refusing to start in production. Set REACH_SECRET on this service before starting Reach.";
}

export function productionSessionSecretMissing(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" && !env.REACH_SECRET?.trim();
}

/** Fail the production server when the session secret was left unset. */
export function assertProductionSessionSecret(env: NodeJS.ProcessEnv = process.env) {
  if (env.NEXT_PHASE === "phase-production-build") return;
  if (!productionSessionSecretMissing(env)) return;
  throw new Error(productionSecretError());
}

/** Session HMAC key. Production never falls back to the demo secret. */
export function sessionSecret(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.REACH_SECRET?.trim();
  if (configured) return configured;
  if (env.NODE_ENV === "production") {
    throw new Error(productionSecretError());
  }
  return DEMO_SESSION_SECRET;
}
