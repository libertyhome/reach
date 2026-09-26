export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertProductionSessionSecret } = await import("./lib/session-secret");
  assertProductionSessionSecret();
}
