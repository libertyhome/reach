import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { migrate } from "./migrate";

function resolveDbPath() {
  if (process.env.REACH_DB_PATH) return process.env.REACH_DB_PATH;
  return path.join(process.cwd(), "data", "reach.db");
}

const globalForDb = globalThis as unknown as { reachDb?: Database.Database };

function openDatabase() {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function getDb() {
  if (!globalForDb.reachDb) globalForDb.reachDb = openDatabase();
  return globalForDb.reachDb;
}

export function resetDbHandle() {
  if (globalForDb.reachDb) {
    try {
      globalForDb.reachDb.close();
    } catch {
      // ignore
    }
    globalForDb.reachDb = undefined;
  }
}

export function dbPath() {
  return resolveDbPath();
}
