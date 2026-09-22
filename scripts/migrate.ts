import { dbPath, getDb, resetDbHandle } from "../src/lib/db";

try {
  getDb();
  console.log(`Reach schema ready at ${dbPath()}`);
  resetDbHandle();
  process.exit(0);
} catch (error) {
  console.error(error);
  resetDbHandle();
  process.exit(1);
}
