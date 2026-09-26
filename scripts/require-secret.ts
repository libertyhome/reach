import { productionSecretError, productionSessionSecretMissing } from "../src/lib/session-secret";

// `npm run start` is the production server. The container sets NODE_ENV=production
// before this runs; next start does the same if it is reached.
if (process.env.NODE_ENV === "production" && productionSessionSecretMissing()) {
  console.error(productionSecretError());
  process.exit(1);
}
