import type { House } from "./types";

export type CatalogRoom = { name: string; capacity: number };

/** Weltevreden Manor: 22 beds. Names and capacities are the house layout. */
export const MANOR_ROOM_CATALOG: readonly CatalogRoom[] = [
  { name: "Willow", capacity: 4 },
  { name: "Cedar", capacity: 4 },
  { name: "Beech", capacity: 2 },
  { name: "Holly", capacity: 1 },
  { name: "Chestnut", capacity: 4 },
  { name: "Tulip", capacity: 1 },
  { name: "Elm", capacity: 1 },
  { name: "Oak", capacity: 1 },
  { name: "Pepper", capacity: 2 },
  { name: "Maple", capacity: 2 },
];

/** Liberty Lodge: 16 beds. Room names stay numbered so they never collide with Manor. */
export const LODGE_ROOM_CATALOG: readonly CatalogRoom[] = [
  { name: "Room 1", capacity: 2 },
  { name: "Room 2", capacity: 2 },
  { name: "Room 3", capacity: 2 },
  { name: "Room 4", capacity: 2 },
  { name: "Room 5", capacity: 2 },
  { name: "Room 6", capacity: 3 },
  { name: "Room 7", capacity: 1 },
  { name: "Room 8", capacity: 2 },
];

export function catalogFor(house: House): readonly CatalogRoom[] {
  return house === "manor" ? MANOR_ROOM_CATALOG : LODGE_ROOM_CATALOG;
}

export function bedCapacity(house: House) {
  return catalogFor(house).reduce((sum, room) => sum + room.capacity, 0);
}

export function roomsFor(house: House): readonly string[] {
  return catalogFor(house).map((room) => room.name);
}

export function roomId(house: House, name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${house}-${slug}`;
}
