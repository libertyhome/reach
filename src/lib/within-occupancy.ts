import { catalogFor } from "./houses";
import { formatSentAt } from "./within-send";
import { handoffSecret, withinBaseUrl } from "./handoff";
import { getDb } from "./db";
import { findPersonByWithinClientId } from "./people";
import type { House } from "./types";

/**
 * Live bed census from Within.
 *
 * Suggested contract (field names are adapted, not hard-coded into the UI):
 * GET /api/integration/occupancy
 * Authorization: Bearer <REACH_WITHIN_HANDOFF_SECRET>
 * (X-Reach-Handoff-Secret is accepted by Within on the send; we send Bearer.)
 *
 * {
 *   "houses": [
 *     {
 *       "house": "weltevreden_manor" | "liberty_lodge",
 *       "totals": { "capacity": 22, "occupied": 1 },
 *       "rooms": [
 *         {
 *           "name": "Willow",
 *           "capacity": 4,
 *           "beds": [
 *             { "patientName": "Ada Nkosi", "clientId": "reach-ada", "admissionDate": "2026-09-12" }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * Manor and Lodge are parsed into separate houses and rendered on separate pages.
 */

const CACHE_ID = "latest";

export type BedSlot = {
  status: "occupied" | "vacant" | "unknown";
  patientName: string;
  clientId: string;
  admissionDate: string;
  reachPersonId: string;
};

export type OccupancyRoomView = {
  name: string;
  capacity: number;
  occupied: number;
  beds: BedSlot[];
};

export type HouseOccupancyView = {
  house: House;
  capacity: number;
  occupied: number;
  rooms: OccupancyRoomView[];
  syncedAt: string;
  syncedAtLabel: string;
  live: boolean;
  unreachable: boolean;
  known: boolean;
};

type Occupant = {
  patientName: string;
  clientId: string;
  admissionDate: string;
};

type ParsedRoom = {
  name: string;
  capacity: number;
  occupants: Occupant[];
};

type ParsedHouse = {
  rooms: ParsedRoom[];
};

type CachedCensus = {
  syncedAt: string;
  houses: Partial<Record<House, ParsedHouse>>;
};

type FetchLike = typeof fetch;

const HOUSE_KEYS: Record<string, House> = {
  manor: "manor",
  weltevreden_manor: "manor",
  weltevredenmanor: "manor",
  "weltevreden manor": "manor",
  lodge: "lodge",
  liberty_lodge: "lodge",
  libertylodge: "lodge",
  "liberty lodge": "lodge",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return value.trim();
}

function positiveInt(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(number) || number <= 0) return 0;
  return number;
}

function houseFrom(value: unknown): House | null {
  const key = text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const compact = key.replace(/ /g, "");
  return HOUSE_KEYS[key] ?? HOUSE_KEYS[key.replace(/ /g, "_")] ?? HOUSE_KEYS[compact] ?? null;
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function occupantFrom(value: unknown): Occupant | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const patientName = firstText(record, [
    "patientName",
    "patient_name",
    "name",
    "fullName",
    "full_name",
    "residentName",
    "resident_name",
  ]);
  const clientId = firstText(record, [
    "clientId",
    "client_id",
    "withinClientId",
    "within_client_id",
    "reachClientId",
    "reach_client_id",
  ]);
  const admissionDate = firstText(record, [
    "admissionDate",
    "admission_date",
    "admittedOn",
    "admitted_on",
    "admittedAt",
    "admitted_at",
  ]).slice(0, 10);
  const occupiedFlag = record.occupied ?? record.vacant;
  if (occupiedFlag === false || record.vacant === true || record.status === "vacant") return null;
  if (!patientName && !clientId) return null;
  return { patientName, clientId, admissionDate };
}

function occupantsFrom(value: unknown): Occupant[] {
  if (!Array.isArray(value)) return [];
  return value.map(occupantFrom).filter((occupant): occupant is Occupant => Boolean(occupant));
}

function roomFrom(value: unknown): ParsedRoom | null {
  const record = asRecord(value);
  if (!record) return null;
  const name = firstText(record, ["name", "room", "roomName", "room_name"]);
  if (!name) return null;
  const numericBeds = typeof record.beds === "number" ? record.beds : 0;
  const occupants = occupantsFrom(
    Array.isArray(record.beds) ? record.beds : (record.occupants ?? record.patients ?? record.residents),
  );
  const capacity =
    positiveInt(record.capacity) ||
    positiveInt(record.bedCount) ||
    positiveInt(record.bed_count) ||
    positiveInt(numericBeds) ||
    occupants.length;
  return { name, capacity, occupants };
}

function housePayload(value: unknown): ParsedHouse | null {
  const record = asRecord(value);
  if (!record) return null;
  const roomsValue = record.rooms ?? record.roomList ?? record.room_list;
  if (!Array.isArray(roomsValue)) return null;
  return { rooms: roomsValue.map(roomFrom).filter((room): room is ParsedRoom => Boolean(room)) };
}

function takeHouse(target: Partial<Record<House, ParsedHouse>>, key: unknown, value: unknown) {
  const house = houseFrom(key);
  const parsed = housePayload(value);
  if (!house || !parsed) return;
  target[house] = parsed;
}

/**
 * Normalize Within's occupancy JSON into per-house rooms.
 * Returns null when the payload is not a census, so a bad body cannot replace the last sync.
 */
export function adaptOccupancy(payload: unknown): Partial<Record<House, ParsedHouse>> | null {
  const root = asRecord(payload);
  if (!root) return null;
  const houses: Partial<Record<House, ParsedHouse>> = {};

  const list = root.houses ?? root.facilities ?? root.occupancy;
  if (Array.isArray(list)) {
    for (const entry of list) {
      const record = asRecord(entry);
      if (!record) continue;
      takeHouse(houses, record.house ?? record.facility ?? record.id ?? record.name, record);
    }
  } else {
    const nested = asRecord(list);
    if (nested) {
      for (const [key, value] of Object.entries(nested)) takeHouse(houses, key, value);
    }
  }

  for (const key of ["manor", "lodge", "weltevreden_manor", "liberty_lodge"]) {
    if (key in root) takeHouse(houses, key, root[key]);
  }

  if (!houses.manor && !houses.lodge) return null;
  return houses;
}

function readCache(): CachedCensus | null {
  const row = getDb()
    .prepare(`SELECT payload_json, synced_at FROM occupancy_sync WHERE id = ?`)
    .get(CACHE_ID) as { payload_json: string; synced_at: string } | undefined;
  if (!row) return null;
  try {
    const houses = adaptOccupancy(JSON.parse(row.payload_json));
    if (!houses) return null;
    return { syncedAt: row.synced_at, houses };
  } catch {
    return null;
  }
}

function writeCache(houses: Partial<Record<House, ParsedHouse>>, syncedAt: string) {
  const previous = readCache();
  const merged: Partial<Record<House, ParsedHouse>> = { ...previous?.houses, ...houses };
  getDb()
    .prepare(
      `INSERT INTO occupancy_sync (id, payload_json, synced_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, synced_at = excluded.synced_at`,
    )
    .run(CACHE_ID, JSON.stringify({ houses: merged }), syncedAt);
}

export function clearOccupancyCache() {
  getDb().prepare(`DELETE FROM occupancy_sync WHERE id = ?`).run(CACHE_ID);
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function presentRooms(house: House, parsed: ParsedHouse | undefined, known: boolean): OccupancyRoomView[] {
  const catalog = catalogFor(house);
  const incoming = new Map<string, ParsedRoom>();
  for (const room of parsed?.rooms ?? []) incoming.set(normalizeName(room.name), room);
  const used = new Set<string>();

  const rooms = catalog.map((entry) => {
    const match = incoming.get(normalizeName(entry.name));
    if (match) used.add(normalizeName(match.name));
    return roomView(entry.name, match?.capacity || entry.capacity, match?.occupants ?? [], known);
  });

  for (const room of parsed?.rooms ?? []) {
    const key = normalizeName(room.name);
    if (used.has(key)) continue;
    used.add(key);
    rooms.push(roomView(room.name, room.capacity || room.occupants.length || 1, room.occupants, known));
  }
  return rooms;
}

function roomView(name: string, capacity: number, occupants: Occupant[], known: boolean): OccupancyRoomView {
  const size = Math.max(capacity, occupants.length, 1);
  const beds: BedSlot[] = occupants.slice(0, size).map((occupant) => ({
    status: "occupied",
    patientName: occupant.patientName || "Occupied",
    clientId: occupant.clientId,
    admissionDate: occupant.admissionDate,
    reachPersonId: "",
  }));
  while (beds.length < size) {
    beds.push({
      status: known ? "vacant" : "unknown",
      patientName: "",
      clientId: "",
      admissionDate: "",
      reachPersonId: "",
    });
  }
  return { name, capacity: size, occupied: beds.filter((bed) => bed.status === "occupied").length, beds };
}

function linkReachPeople(view: HouseOccupancyView) {
  for (const room of view.rooms) {
    for (const bed of room.beds) {
      if (!bed.clientId) continue;
      const person = findPersonByWithinClientId(bed.clientId);
      if (person) bed.reachPersonId = person.id;
    }
  }
}

function viewFor(
  house: House,
  parsed: ParsedHouse | undefined,
  options: { syncedAt: string; live: boolean; unreachable: boolean; known: boolean },
): HouseOccupancyView {
  const rooms = presentRooms(house, parsed, options.known);
  const view: HouseOccupancyView = {
    house,
    capacity: rooms.reduce((sum, room) => sum + room.capacity, 0),
    occupied: rooms.reduce((sum, room) => sum + room.occupied, 0),
    rooms,
    syncedAt: options.syncedAt,
    syncedAtLabel: options.syncedAt ? formatSentAt(options.syncedAt) : "",
    live: options.live,
    unreachable: options.unreachable,
    known: options.known,
  };
  if (options.known) linkReachPeople(view);
  return view;
}

export async function readHouseOccupancy(
  house: House,
  options: { fetchImpl?: FetchLike; baseUrl?: string; secret?: string; now?: Date; timeoutMs?: number } = {},
): Promise<HouseOccupancyView> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = (options.baseUrl ?? withinBaseUrl()).replace(/\/$/, "");
  const secret = options.secret ?? handoffSecret();
  const now = options.now ?? new Date();
  const timeoutMs = options.timeoutMs ?? 5000;

  try {
    const response = await fetchImpl(`${base}/api/integration/occupancy`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secret}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const payload: unknown = await response.json();
    const houses = adaptOccupancy(payload);
    if (!houses) throw new Error("unrecognized occupancy");
    const syncedAt = now.toISOString();
    writeCache(houses, syncedAt);
    const cached = readCache();
    return viewFor(house, cached?.houses[house] ?? houses[house], {
      syncedAt,
      live: true,
      unreachable: false,
      known: true,
    });
  } catch {
    const cached = readCache();
    if (cached?.houses[house]) {
      return viewFor(house, cached.houses[house], {
        syncedAt: cached.syncedAt,
        live: false,
        unreachable: true,
        known: true,
      });
    }
    return viewFor(house, undefined, {
      syncedAt: "",
      live: false,
      unreachable: true,
      known: false,
    });
  }
}
