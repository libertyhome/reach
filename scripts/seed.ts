import { dbPath, getDb, resetDbHandle } from "../src/lib/db";
import { occupancyCounts } from "../src/lib/people";
import { seed } from "../src/lib/seed";

try {
  getDb();
  seed();
  const occ = occupancyCounts();
  console.log(`Seeded Reach at ${dbPath()}`);
  console.log(`Manor occupied ${occ.manor}/22 · Lodge occupied ${occ.lodge}/16`);
  resetDbHandle();
  process.exit(0);
} catch (error) {
  console.error(error);
  resetDbHandle();
  process.exit(1);
}
