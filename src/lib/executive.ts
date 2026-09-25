import { listAudit } from "./audit";
import { HOUSE_CAPACITY, HOUSE_LABEL, HOUSE_SHORT, isLeadSource, leadSourceLabel, personDisplayName } from "./labels";
import { facilityFor, occupancyParityRow, programPhaseFor } from "./occupancy";
import {
  COMMERCIAL_CHECKLIST,
  ALL_LEAD_SOURCES,
  HOUSES,
  PROGRAM_PHASES,
  type AuditEvent,
  type House,
  type LeadSource,
  type Person,
  type ProgramPhase,
  type Stage,
  type User,
} from "./types";

const HYGIENE_STAGES: Stage[] = ["enquiry", "next_steps", "approval", "admit"];

export type FacilityOccupancy = {
  house: House;
  label: string;
  shortLabel: string;
  capacity: number;
  occupied: number;
  percent: number;
  phases: { phase: string; label: string; occupied: number; percentOfCapacity: number }[];
};

export type ResidentOccupancyRow = ReturnType<typeof occupancyParityRow> & {
  id: string;
};

export type MovementRow = {
  id: string;
  name: string;
  facility: string;
  phase: string;
  date: string;
  leadSource: string;
  methodOfContact: string;
  referrer: string;
  referrerContact: string;
  referralOwner: string;
};

export type HygieneFlag = {
  personId: string;
  name: string;
  stage: Stage;
  openGates: string[];
  urgent: boolean;
  repeatUncleared: { gate: string; times: number }[];
};

export type OccupancySnapshot = {
  asOf: string;
  facilities: FacilityOccupancy[];
  residents: ResidentOccupancyRow[];
  arrivals: MovementRow[];
  discharges: MovementRow[];
  hygiene: HygieneFlag[];
  mtd: { month: string; enquiries: number; admissions: number };
};

export type AnalyticsFilters = {
  from: string;
  to: string;
  facility: "all" | House;
  phase: "all" | ProgramPhase;
  leadSource: "all" | LeadSource;
  referrer: string;
  owner: string;
  rangeClamped: boolean;
};

export type ChartPoint = { label: string; values: number[] };

export type ExecutiveAnalytics = {
  filters: AnalyticsFilters;
  enquiryCount: number;
  cohortAdmitted: number;
  conversionPercent: number | null;
  admissionEventCount: number;
  enquiryVolume: ChartPoint[];
  enquirySeriesName: string;
  leadSourcePie: { key: string; label: string; value: number }[];
  leadSourceTrend: ChartPoint[];
  leadSourceSeries: { key: string; label: string }[];
  admissionsOverTime: ChartPoint[];
  referrerOptions: string[];
  ownerOptions: { id: string; name: string }[];
  demographics: {
    status: "unavailable";
    todo: string;
  };
};

const DEMOGRAPHICS_TODO =
  "TODO: age band, gender, and nationality or region are not stored on Reach people. This panel stays empty until those fields exist. No placeholder series is shown.";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

export function percentOf(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function admissionDay(person: Person) {
  if (person.admission_date) return person.admission_date.slice(0, 10);
  if (person.admitted_at) return person.admitted_at.slice(0, 10);
  return "";
}

function wasAdmitted(person: Person) {
  return Boolean(person.admitted_at) || person.stage === "resident";
}

function inRange(day: string, from: string, to: string) {
  return Boolean(day) && day >= from && day <= to;
}

function shortDate(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function daySpan(from: string, to: string) {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

function eachDay(from: string, to: string) {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    days.push(isoDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function weekStart(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = date.getUTCDay();
  const diff = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - diff);
  return isoDay(date);
}

function bucketsFor(from: string, to: string) {
  const days = eachDay(from, to);
  if (days.length <= 45) {
    return days.map((day) => ({ key: day, label: shortDate(day), match: (value: string) => value === day }));
  }
  const weeks: { key: string; label: string; match: (value: string) => boolean }[] = [];
  for (const day of days) {
    const key = weekStart(day);
    const existing = weeks.find((bucket) => bucket.key === key);
    if (!existing) {
      weeks.push({
        key,
        label: shortDate(key),
        match: (value: string) => weekStart(value) === key,
      });
    }
  }
  return weeks;
}

export function repeatUnclearedCounts(
  events: Pick<AuditEvent, "undone" | "action" | "before_json" | "after_json">[],
) {
  const counts = new Map<string, number>();
  const keys = COMMERCIAL_CHECKLIST.map((item) => item.key);
  for (const event of events) {
    if (event.undone) continue;
    if (event.action !== "field_edit" && event.action !== "undo") continue;
    let before: Record<string, unknown> = {};
    let after: Record<string, unknown> = {};
    try {
      before = JSON.parse(event.before_json) as Record<string, unknown>;
      after = JSON.parse(event.after_json) as Record<string, unknown>;
    } catch {
      continue;
    }
    for (const key of keys) {
      if (before[key] === 1 && after[key] === 0) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function movementFrom(person: Person, date: string): MovementRow {
  const parity = occupancyParityRow(person);
  const contact = [person.referrer_contact_person, person.referrer_phone].filter(Boolean).join(" · ");
  return {
    id: person.id,
    name: parity.name,
    facility: parity.facility,
    phase: parity.phase,
    date,
    leadSource: parity.lead_source,
    methodOfContact: parity.method_of_contact,
    referrer: parity.referrer,
    referrerContact: contact,
    referralOwner: parity.referral_owner,
  };
}

function phaseRows(house: House, residents: Person[]): FacilityOccupancy["phases"] {
  if (house === "lodge") {
    const occupied = residents.filter((person) => programPhaseFor(person) === "3").length;
    return [
      {
        phase: "3",
        label: "Phase 3",
        occupied,
        percentOfCapacity: percentOf(occupied, HOUSE_CAPACITY.lodge),
      },
    ];
  }
  const phases: FacilityOccupancy["phases"] = PROGRAM_PHASES.filter((phase) => phase !== "3").map((phase) => {
    const occupied = residents.filter((person) => programPhaseFor(person) === phase).length;
    return {
      phase,
      label: `Phase ${phase}`,
      occupied,
      percentOfCapacity: percentOf(occupied, HOUSE_CAPACITY.manor),
    };
  });
  const unset = residents.filter((person) => programPhaseFor(person) === "").length;
  if (unset > 0) {
    phases.push({
      phase: "",
      label: "Phase unset",
      occupied: unset,
      percentOfCapacity: percentOf(unset, HOUSE_CAPACITY.manor),
    });
  }
  return phases;
}

export function buildOccupancySnapshot(people: Person[], asOf = new Date()): OccupancySnapshot {
  const today = isoDay(asOf);
  const month = today.slice(0, 7);
  const residents = people
    .filter((person) => person.stage === "resident" && !person.archived_at && (person.house === "manor" || person.house === "lodge"))
    .sort((a, b) => a.house.localeCompare(b.house) || a.last_name.localeCompare(b.last_name));

  const facilities = HOUSES.map((house) => {
    const inHouse = residents.filter((person) => person.house === house);
    const capacity = HOUSE_CAPACITY[house];
    return {
      house,
      label: HOUSE_LABEL[house],
      shortLabel: HOUSE_SHORT[house],
      capacity,
      occupied: inHouse.length,
      percent: percentOf(inHouse.length, capacity),
      phases: phaseRows(house, inHouse),
    };
  });

  const arrivals = people
    .filter((person) => {
      if (person.archived_at || person.stage === "resident" || person.stage === "archived") return false;
      const confirmed = person.admission_date_agreed === 1 || person.stage === "admit";
      if (!confirmed) return false;
      const date = (person.expected_arrival || person.admission_date).slice(0, 10);
      return date >= today;
    })
    .map((person) => movementFrom(person, (person.expected_arrival || person.admission_date).slice(0, 10)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const discharges = residents
    .filter((person) => person.planned_discharge_date.slice(0, 10) >= today)
    .map((person) => movementFrom(person, person.planned_discharge_date.slice(0, 10)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const hygienePeople = people.filter(
    (person) => !person.archived_at && HYGIENE_STAGES.includes(person.stage),
  );
  const hygiene: HygieneFlag[] = [];
  for (const person of hygienePeople) {
    const open = COMMERCIAL_CHECKLIST.filter((item) => person[item.key] !== 1);
    if (open.length === 0) continue;
    const repeats = repeatUnclearedCounts(listAudit(person.id, 200));
    const repeatUncleared = open
      .filter((item) => (repeats.get(item.key) ?? 0) > 1)
      .map((item) => ({ gate: item.label, times: repeats.get(item.key) ?? 0 }));
    hygiene.push({
      personId: person.id,
      name: personDisplayName(person),
      stage: person.stage,
      openGates: open.map((item) => item.label),
      urgent: repeatUncleared.length > 0,
      repeatUncleared,
    });
  }
  hygiene.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.name.localeCompare(b.name));

  const mtdEnquiries = people.filter((person) => person.enquiry_date.slice(0, 7) === month).length;
  const mtdAdmissions = people.filter(
    (person) => wasAdmitted(person) && admissionDay(person).slice(0, 7) === month,
  ).length;

  return {
    asOf: today,
    facilities,
    residents: residents.map((person) => ({ ...occupancyParityRow(person), id: person.id })),
    arrivals,
    discharges,
    hygiene,
    mtd: { month, enquiries: mtdEnquiries, admissions: mtdAdmissions },
  };
}

function matchesDimensions(person: Person, filters: AnalyticsFilters) {
  if (filters.facility !== "all" && facilityFor(person) !== filters.facility) return false;
  if (filters.phase !== "all" && programPhaseFor(person) !== filters.phase) return false;
  if (filters.leadSource !== "all" && person.lead_source !== filters.leadSource) return false;
  if (filters.referrer !== "all" && person.referrer_name !== filters.referrer) return false;
  if (filters.owner !== "all" && person.referral_owner_user_id !== filters.owner) return false;
  return true;
}

export function parseAnalyticsFilters(
  params: {
    from?: string;
    to?: string;
    facility?: string;
    phase?: string;
    leadSource?: string;
    referrer?: string;
    owner?: string;
  },
  staff: User[],
  asOf = new Date(),
): AnalyticsFilters {
  const today = isoDay(asOf);
  let from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : monthStart(today);
  let to = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  let rangeClamped = false;
  if (daySpan(from, to) > 366) {
    const start = new Date(`${to}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - 365);
    from = isoDay(start);
    rangeClamped = true;
  }
  const facility = HOUSES.includes(params.facility as House) ? (params.facility as House) : "all";
  const phase = PROGRAM_PHASES.includes(params.phase as ProgramPhase) ? (params.phase as ProgramPhase) : "all";
  const requestedSource = params.leadSource ?? "";
  const leadSource = isLeadSource(requestedSource) ? requestedSource : "all";
  const owner =
    params.owner && params.owner !== "all" && staff.some((user) => user.id === params.owner)
      ? params.owner
      : "all";
  const referrer = params.referrer && params.referrer !== "all" ? params.referrer : "all";
  return { from, to, facility, phase, leadSource, referrer, owner, rangeClamped };
}

export function buildExecutiveAnalytics(
  people: Person[],
  staff: User[],
  filters: AnalyticsFilters,
): ExecutiveAnalytics {
  const scoped = people.filter((person) => matchesDimensions(person, filters));
  const enquiries = scoped.filter((person) => inRange(person.enquiry_date.slice(0, 10), filters.from, filters.to));
  const cohortAdmitted = enquiries.filter(wasAdmitted).length;
  const admissions = scoped.filter(
    (person) => wasAdmitted(person) && inRange(admissionDay(person), filters.from, filters.to),
  );
  const buckets = bucketsFor(filters.from, filters.to);

  const enquiryVolume = buckets.map((bucket) => ({
    label: bucket.label,
    values: [enquiries.filter((person) => bucket.match(person.enquiry_date.slice(0, 10))).length],
  }));

  const leadKeys = ALL_LEAD_SOURCES.filter((source) => enquiries.some((person) => person.lead_source === source));
  const leadSourcePie = leadKeys.map((source) => ({
    key: source,
    label: leadSourceLabel(source),
    value: enquiries.filter((person) => person.lead_source === source).length,
  }));
  const leadSourceTrend = buckets.map((bucket) => ({
    label: bucket.label,
    values: leadKeys.map(
      (source) =>
        enquiries.filter(
          (person) => person.lead_source === source && bucket.match(person.enquiry_date.slice(0, 10)),
        ).length,
    ),
  }));
  const admissionsOverTime = buckets.map((bucket) => ({
    label: bucket.label,
    values: [admissions.filter((person) => bucket.match(admissionDay(person))).length],
  }));

  const referrerOptions = [...new Set(people.map((person) => person.referrer_name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    filters,
    enquiryCount: enquiries.length,
    cohortAdmitted,
    conversionPercent: enquiries.length === 0 ? null : percentOf(cohortAdmitted, enquiries.length),
    admissionEventCount: admissions.length,
    enquiryVolume,
    enquirySeriesName: "Enquiries",
    leadSourcePie,
    leadSourceTrend,
    leadSourceSeries: leadKeys.map((source) => ({ key: source, label: leadSourceLabel(source) })),
    admissionsOverTime,
    referrerOptions,
    ownerOptions: staff.map((user) => ({ id: user.id, name: user.name })).sort((a, b) => a.name.localeCompare(b.name)),
    demographics: { status: "unavailable", todo: DEMOGRAPHICS_TODO },
  };
}
