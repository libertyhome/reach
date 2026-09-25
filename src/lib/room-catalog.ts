import type Database from "better-sqlite3";
import { catalogFor, roomId } from "./houses";
import type { House } from "./types";

/** Insert the current Manor and Lodge layout and drop retired room names. */
export function syncRoomCatalog(db: Database.Database) {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(rooms)`).all() as { name: string }[]).map((column) => column.name),
  );
  if (!columns.has("capacity")) {
    db.exec(`ALTER TABLE rooms ADD COLUMN capacity INTEGER NOT NULL DEFAULT 1`);
  }

  const upsert = db.prepare(
    `INSERT INTO rooms (id, house, name, sort_order, capacity)
     VALUES (@id, @house, @name, @sort_order, @capacity)
     ON CONFLICT(id) DO UPDATE SET
       house = excluded.house,
       name = excluded.name,
       sort_order = excluded.sort_order,
       capacity = excluded.capacity`,
  );

  const keep = new Set<string>();
  for (const house of ["manor", "lodge"] as House[]) {
    catalogFor(house).forEach((room, index) => {
      const id = roomId(house, room.name);
      keep.add(id);
      upsert.run({ id, house, name: room.name, sort_order: index, capacity: room.capacity });
    });
  }

  const clearRoom = db.prepare(`UPDATE people SET room_id = '' WHERE room_id = ?`);
  const clearPreferred = db.prepare(`UPDATE people SET preferred_room_id = '' WHERE preferred_room_id = ?`);
  const remove = db.prepare(`DELETE FROM rooms WHERE id = ?`);
  const existing = db.prepare(`SELECT id FROM rooms`).all() as { id: string }[];
  for (const row of existing) {
    if (keep.has(row.id)) continue;
    clearRoom.run(row.id);
    clearPreferred.run(row.id);
    remove.run(row.id);
  }
}
