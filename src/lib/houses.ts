import type { House } from "./types";

export const MANOR_ROOMS = [
  "Yew",
  "Oak",
  "Willow",
  "Cedar",
  "Olive",
  "Fig",
  "Maple",
  "Birch",
  "Alder",
  "Elm",
  "Ash",
  "Pine",
  "Beech",
  "Rowan",
  "Holly",
  "Hazel",
  "Poplar",
  "Linden",
  "Cypress",
  "Laurel",
  "Magnolia",
] as const;

export const LODGE_ROOMS = [
  "Protea",
  "Fynbos",
  "Restio",
  "Aloe",
  "Daisy",
  "Iris",
  "Lily",
  "Fern",
  "Reed",
  "Moss",
  "Stream",
  "Koppie",
  "Dune",
  "Cove",
  "Haven",
  "Nest",
] as const;

export function roomsFor(house: House): readonly string[] {
  return house === "manor" ? MANOR_ROOMS : LODGE_ROOMS;
}

export function roomId(house: House, name: string) {
  return `${house}-${name.toLowerCase()}`;
}
