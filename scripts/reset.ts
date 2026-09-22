import fs from "fs";
import { dbPath, getDb, resetDbHandle } from "../src/lib/db";
import { seed } from "../src/lib/seed";

try {
  resetDbHandle();
  const path = dbPath();
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${path}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  getDb();
  seed();
  console.log(`Reset Reach database at ${dbPath()}`);
  resetDbHandle();
  process.exit(0);
} catch (error) {
  console.error(error);
  resetDbHandle();
  process.exit(1);
}
