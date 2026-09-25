import { getDb } from "./db";
import { roomOccupants } from "./people";
import { syncRoomCatalog } from "./room-catalog";
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
  syncRoomCatalog(getDb());
}

export type RoomCard = Room & { occupants: Person[]; occupant: Person | null };

export function houseBoard(house: House): RoomCard[] {
  return listRooms(house).map((room) => {
    const occupants = roomOccupants(room.id);
    return {
      ...room,
      occupants,
      occupant: occupants[0] ?? null,
    };
  });
}
