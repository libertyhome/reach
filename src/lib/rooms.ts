import { getDb } from "./db";
import { roomsFor, roomId } from "./houses";
import { roomOccupant } from "./people";
import type { House, Person, Room } from "./types";

export function listRooms(house: House): Room[] {
  return getDb()
    .prepare(`SELECT * FROM rooms WHERE house = ? ORDER BY sort_order ASC`)
    .all(house) as Room[];
}

export function getRoom(id: string): Room | null {
  return (getDb().prepare(`SELECT * FROM rooms WHERE id = ?`).get(id) as Room | undefined) ?? null;
}

export function findRoomByName(house: House, name: string): Room | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM rooms WHERE house = ? AND name = ?`)
      .get(house, name) as Room | undefined) ?? null
  );
}

export function ensureRooms() {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO rooms (id, house, name, sort_order) VALUES (?, ?, ?, ?)`,
  );
  for (const house of ["manor", "lodge"] as House[]) {
    roomsFor(house).forEach((name, index) => {
      insert.run(roomId(house, name), house, name, index);
    });
  }
}

export type RoomCard = Room & { occupant: Person | null };

export function houseBoard(house: House): RoomCard[] {
  return listRooms(house).map((room) => ({
    ...room,
    occupant: roomOccupant(room.id),
  }));
}
