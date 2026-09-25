import { catalogFor } from "./houses";
import { formatSentAt } from "./within-send";
import { handoffSecret, withinBaseUrl } from "./handoff";
import { getDb } from "./db";
import { findPersonByWithinClientId } from "./people";
import type { House } from "./types";

/**
 * Live bed census from Within. Spec: libertyhome/within docs/reach-handoff.md.
 *
 * GET /api/integration/occupancy
 * Authorization: Bearer <REACH_WITHIN_HANDOFF_SECRET>
 * X-Reach-Handoff-Secret is the same secret.
 *
 * { ok, asOf, houses, totals }
 * Each house has capacity, occupied, available, unassigned, and rooms.
 * Each bed has a patient or null. unassigned is residents with no bed yet.
 * Within's occupied/available ignore those people. Reach counts them as occupied
 * so an empty bed board is not shown as a free house.
 *
 * Manor and Lodge stay in separate objects and on separate pages.
 */

const CACHE_ID = "latest";

export type BedSlot = {
  id: string;
  label: string;
  status: "occupied" | "vacant" | "unknown";
  patientName: string;
  clientId: string;
  admissionDate: string;
  reachPersonId: string;
};

export type UnassignedResident = {
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
  /** Patients in a bed, plus residents not yet allocated. */
  occupied: number;
  bedOccupied: number;
  /** capacity minus occupied, and never below zero. */
  available: number;
  unassignedCount: number;
  unassigned: UnassignedResident[];
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

type ParsedBed = {
  id: string;
  label: string;
  occupant: Occupant | null;
};

type ParsedRoom = {
  name: string;
  capacity: number;
  beds: ParsedBed[];
};

type ParsedHouse = {
  capacity: number;
  unassigned: Occupant[];
  rooms: ParsedRoom[];
};

export type AdaptedOccupancy = {
  asOf: string;
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

export function unassignedNotice(count: number) {
  if (count <= 0) return "";
  const noun = count === 1 ? "resident" : "residents";
  return `${count} ${noun} not yet allocated to a bed in Within`;
}

export function bedsAvailable(capacity: number, occupied: number) {
  return Math.max(0, capacity - occupied);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return value.trim();
}

function nonNegativeInt(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(number) || number < 0) return 0;
  return number;
}

function positiveInt(value: unknown) {
  const number = nonNegativeInt(value);
  return number > 0 ? number : 0;
}

function houseFrom(value: unknown): House | null {
  const key = text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const compact = key.replace(/ /g, "");
  return HOUSE_KEYS[key] ?? HOUSE_KEYS[key.replace(/ /g, "_")] ?? HOUSE_KEYS[compact] ?? null;
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(record[key]);
    if (value && value !== "null") return value;
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
  if (record.occupied === false || record.vacant === true || record.status === "vacant") return null;
  if (!patientName && !clientId) return null;
  return { patientName, clientId, admissionDate };
}

function bedFrom(value: unknown): ParsedBed {
  if (value == null) return { id: "", label: "", occupant: null };
  const record = asRecord(value);
  if (!record) return { id: "", label: "", occupant: null };
  if ("patient" in record) {
    return {
      id: text(record.id),
      label: text(record.name),
      occupant: record.patient == null ? null : occupantFrom(record.patient),
    };
  }
  if (record.occupied === false || record.vacant === true) {
    return { id: text(record.id), label: text(record.name), occupant: null };
  }
  return { id: text(record.id), label: "", occupant: occupantFrom(record) };
}

function bedsFrom(record: Record<string, unknown>): ParsedBed[] {
  if (Array.isArray(record.beds)) return record.beds.map(bedFrom);
  const list = record.occupants ?? record.patients ?? record.residents;
  if (!Array.isArray(list)) return [];
  return list.map(bedFrom);
}

function unassignedFrom(value: unknown): Occupant[] {
  if (typeof value === "number" || (typeof value === "string" && value.trim())) {
    const count = nonNegativeInt(value);
    return Array.from({ length: count }, () => ({ patientName: "", clientId: "", admissionDate: "" }));
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    return [occupantFrom(item) ?? { patientName: "", clientId: "", admissionDate: "" }];
  });
}

function roomFrom(value: unknown): ParsedRoom | null {
  const record = asRecord(value);
  if (!record) return null;
  const name = firstText(record, ["name", "room", "roomName", "room_name"]);
  if (!name) return null;
  const beds = bedsFrom(record);
  const capacity =
    positiveInt(record.capacity) ||
    positiveInt(record.bedCount) ||
    positiveInt(record.bed_count) ||
    (typeof record.beds === "number" ? positiveInt(record.beds) : 0) ||
    beds.length ||
    1;
  while (beds.length < capacity) beds.push({ id: "", label: "", occupant: null });
  return { name, capacity: Math.max(capacity, beds.length), beds };
}

function housePayload(value: unknown): ParsedHouse | null {
  const record = asRecord(value);
  if (!record) return null;
  const roomsValue = record.rooms ?? record.roomList ?? record.room_list;
  if (!Array.isArray(roomsValue)) return null;
  const rooms = roomsValue.flatMap((room) => {
    const parsed = roomFrom(room);
    return parsed ? [parsed] : [];
  });
  const capacity = positiveInt(record.capacity) || rooms.reduce((sum, room) => sum + room.capacity, 0);
  return { capacity, unassigned: unassignedFrom(record.unassigned), rooms };
}

function takeHouse(target: Partial<Record<House, ParsedHouse>>, key: unknown, value: unknown) {
  const house = houseFrom(key);
  const parsed = housePayload(value);
  if (!house || !parsed) return;
  target[house] = parsed;
}

/**
 * Normalize Within's occupancy JSON.
 * Returns null when the body is not a census, so a bad response cannot replace the last sync.
 */
export function adaptOccupancy(payload: unknown): AdaptedOccupancy | null {
  const root = asRecord(payload);
  if (!root) return null;
  if (root.ok === false) return null;
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
  const asOf = firstText(root, ["asOf", "as_of", "syncedAt", "synced_at"]);
  return { asOf, houses };
}

function toPayload(census: AdaptedOccupancy) {
  const houses = (["manor", "lodge"] as const).flatMap((house) => {
    const parsed = census.houses[house];
    if (!parsed) return [];
    const bedOccupied = parsed.rooms.reduce(
      (sum, room) => sum + room.beds.filter((bed) => bed.occupant).length,
      0,
    );
    return [
      {
        house: house === "manor" ? "weltevreden_manor" : "liberty_lodge",
        capacity: parsed.capacity,
        occupied: bedOccupied,
        available: bedsAvailable(parsed.capacity, bedOccupied),
        unassigned: parsed.unassigned.map((person) => ({
          name: person.patientName,
          clientId: person.clientId,
          admissionDate: person.admissionDate || null,
        })),
        rooms: parsed.rooms.map((room) => ({
          name: room.name,
          capacity: room.capacity,
          beds: room.beds.map((bed) => ({
            id: bed.id,
            name: bed.label,
            occupied: Boolean(bed.occupant),
            patient: bed.occupant
              ? {
                  name: bed.occupant.patientName,
                  clientId: bed.occupant.clientId,
                  admissionDate: bed.occupant.admissionDate || null,
                }
              : null,
          })),
        })),
      },
    ];
  });
  return { ok: true, asOf: census.asOf, houses };
}

function readCache(): (AdaptedOccupancy & { syncedAt: string }) | null {
  try {
    const row = getDb()
      .prepare(`SELECT payload_json, synced_at FROM occupancy_sync WHERE id = ?`)
      .get(CACHE_ID) as { payload_json: string; synced_at: string } | undefined;
    if (!row) return null;
    const census = adaptOccupancy(JSON.parse(row.payload_json));
    if (!census) return null;
    return { ...census, syncedAt: row.synced_at };
  } catch {
    return null;
  }
}

function writeCache(census: AdaptedOccupancy, syncedAt: string) {
  const previous = readCache();
  const merged: AdaptedOccupancy = {
    asOf: census.asOf || previous?.asOf || syncedAt,
    houses: { ...previous?.houses, ...census.houses },
  };
  getDb()
    .prepare(
      `INSERT INTO occupancy_sync (id, payload_json, synced_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, synced_at = excluded.synced_at`,
    )
    .run(CACHE_ID, JSON.stringify(toPayload(merged)), syncedAt);
}

export function clearOccupancyCache() {
  getDb().prepare(`DELETE FROM occupancy_sync WHERE id = ?`).run(CACHE_ID);
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function emptyBed(status: BedSlot["status"]): BedSlot {
  return { id: "", label: "", status, patientName: "", clientId: "", admissionDate: "", reachPersonId: "" };
}

function presentRooms(house: House, parsed: ParsedHouse | undefined, known: boolean): OccupancyRoomView[] {
  const catalog = catalogFor(house);
  const incoming = new Map<string, ParsedRoom>();
  for (const room of parsed?.rooms ?? []) incoming.set(normalizeName(room.name), room);
  const used = new Set<string>();

  const rooms = catalog.map((entry) => {
    const match = incoming.get(normalizeName(entry.name));
    if (match) used.add(normalizeName(match.name));
    return roomView(entry.name, match, entry.capacity, known);
  });

  for (const room of parsed?.rooms ?? []) {
    const key = normalizeName(room.name);
    if (used.has(key)) continue;
    rooms.push(roomView(room.name, room, room.capacity, known));
  }
  return rooms;
}

function roomView(name: string, parsed: ParsedRoom | undefined, fallbackCapacity: number, known: boolean): OccupancyRoomView {
  const capacity = parsed?.capacity || fallbackCapacity || 1;
  const source = parsed?.beds ?? [];
  const beds: BedSlot[] = source.map((bed) =>
    bed.occupant
      ? {
          id: bed.id,
          label: bed.label,
          status: "occupied",
          patientName: bed.occupant.patientName || "Occupied",
          clientId: bed.occupant.clientId,
          admissionDate: bed.occupant.admissionDate,
          reachPersonId: "",
        }
      : { ...emptyBed(known ? "vacant" : "unknown"), id: bed.id, label: bed.label },
  );
  while (beds.length < capacity) beds.push(emptyBed(known ? "vacant" : "unknown"));
  return {
    name,
    capacity: Math.max(capacity, beds.length),
    occupied: beds.filter((bed) => bed.status === "occupied").length,
    beds,
  };
}

function reachPersonId(clientId: string) {
  if (!clientId) return "";
  try {
    return findPersonByWithinClientId(clientId)?.id ?? "";
  } catch {
    return "";
  }
}

function viewFor(
  house: House,
  parsed: ParsedHouse | undefined,
  options: { syncedAt: string; live: boolean; unreachable: boolean; known: boolean },
): HouseOccupancyView {
  const rooms = presentRooms(house, parsed, options.known);
  const bedOccupied = rooms.reduce((sum, room) => sum + room.occupied, 0);
  const unassigned = (options.known ? (parsed?.unassigned ?? []) : []).map((person) => ({
    patientName: person.patientName,
    clientId: person.clientId,
    admissionDate: person.admissionDate,
    reachPersonId: reachPersonId(person.clientId),
  }));
  const capacity = options.known
    ? parsed?.capacity || rooms.reduce((sum, room) => sum + room.capacity, 0)
    : rooms.reduce((sum, room) => sum + room.capacity, 0);
  const occupied = options.known ? bedOccupied + unassigned.length : 0;
  const view: HouseOccupancyView = {
    house,
    capacity,
    occupied,
    bedOccupied: options.known ? bedOccupied : 0,
    available: options.known ? bedsAvailable(capacity, occupied) : 0,
    unassignedCount: unassigned.length,
    unassigned,
    rooms,
    syncedAt: options.syncedAt,
    syncedAtLabel: options.syncedAt ? formatSentAt(options.syncedAt) : "",
    live: options.live,
    unreachable: options.unreachable,
    known: options.known,
  };
  if (options.known) {
    for (const room of view.rooms) {
      for (const bed of room.beds) bed.reachPersonId = reachPersonId(bed.clientId);
    }
  }
  return view;
}

function unavailable(house: House): HouseOccupancyView {
  return viewFor(house, undefined, { syncedAt: "", live: false, unreachable: true, known: false });
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
        "X-Reach-Handoff-Secret": secret,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const payload: unknown = await response.json();
    const census = adaptOccupancy(payload);
    if (!census) throw new Error("unrecognized occupancy");
    const syncedAt = census.asOf || now.toISOString();
    try {
      writeCache({ ...census, asOf: syncedAt }, syncedAt);
    } catch {
      // A cache miss must not hide a live census.
    }
    return viewFor(house, census.houses[house], {
      syncedAt,
      live: true,
      unreachable: false,
      known: true,
    });
  } catch {
    try {
      const cached = readCache();
      if (cached?.houses[house]) {
        return viewFor(house, cached.houses[house], {
          syncedAt: cached.asOf || cached.syncedAt,
          live: false,
          unreachable: true,
          known: true,
        });
      }
    } catch {
      return unavailable(house);
    }
    return unavailable(house);
  }
}
