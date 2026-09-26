import ExcelJS from "exceljs";
import { canViewCreditors } from "./access";
import { writeListExportAudit } from "./audit";
import { listCreditors } from "./creditors";
import { listAccountRows, listPaymentInvoices } from "./finance";
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL, INVOICE_STATUS_LABEL, type AccountGroup } from "./finance-types";
import { listAdmittedHistory, listNotAdmittedHistory, closedOn } from "./history";
import {
  HOUSE_SHORT,
  STAGE_LABEL,
  leadSourceLabel,
  notConvertedReasonLabel,
} from "./labels";
import { listPeopleByStage } from "./people";
import type { House, Person, Stage, User } from "./types";
import { listUsers } from "./users";
import { readHouseOccupancy, type HouseOccupancyView } from "./within-occupancy";

export const EXPORT_LISTS = [
  "enquiries",
  "next-steps",
  "approval",
  "admit",
  "admitted",
  "not-admitted",
  "manor",
  "lodge",
  "accounts",
  "creditors",
  "invoices",
] as const;

export type ExportList = (typeof EXPORT_LISTS)[number];

const STAGE_BY_LIST: Partial<Record<ExportList, Stage>> = {
  enquiries: "enquiry",
  "next-steps": "next_steps",
  approval: "approval",
  admit: "admit",
};

export function isExportList(value: string): value is ExportList {
  return (EXPORT_LISTS as readonly string[]).includes(value);
}

/** Same audience as the page. Creditors are executive/finance; every other list is any staff role. */
export function exportDenied(list: string, user: Pick<User, "role">): "unknown" | "forbidden" | null {
  if (!isExportList(list)) return "unknown";
  if (list === "creditors" && !canViewCreditors(user)) return "forbidden";
  return null;
}

export function exportFilename(list: string, now = new Date()) {
  return `reach-${list}-${now.toISOString().slice(0, 10)}.xlsx`;
}

function dateOnly(value: string) {
  return value ? value.slice(0, 10) : "";
}

function personColumns(person: Person, assignedTo: string) {
  return {
    Name: `${person.first_name} ${person.last_name}`.trim(),
    "Preferred name": person.preferred_name,
    Phone: person.phone,
    Email: person.email,
    "Lead source": leadSourceLabel(person.lead_source),
    "Enquiry date": dateOnly(person.enquiry_date),
    Referrer: person.referrer_name,
    Funding: person.funding_type.replace(/_/g, " "),
    "House preference": person.house_preference,
    House: person.house ? HOUSE_SHORT[person.house] : "",
    "Expected arrival": dateOnly(person.expected_arrival),
    "Admission date": dateOnly(person.admission_date),
    "Admitted at": dateOnly(person.admitted_at),
    "Planned discharge": dateOnly(person.planned_discharge_date),
    "Assigned to": assignedTo,
    Stage: STAGE_LABEL[person.stage] ?? person.stage,
    Closed: closedOn(person),
    "Not converted reason": person.not_converted_reason
      ? notConvertedReasonLabel(person.not_converted_reason)
      : "",
  };
}

const PIPELINE_COLUMNS = [
  "Name",
  "Preferred name",
  "Phone",
  "Email",
  "Lead source",
  "Enquiry date",
  "Referrer",
  "Funding",
  "House preference",
  "Expected arrival",
  "Assigned to",
  "Stage",
] as const;

const ADMITTED_COLUMNS = [
  "Name",
  "Stage",
  "House",
  "Admission date",
  "Admitted at",
  "Closed",
  "Lead source",
  "Phone",
  "Email",
  "Referrer",
] as const;

const NOT_ADMITTED_COLUMNS = [
  "Name",
  "Lead source",
  "Not converted reason",
  "Closed",
  "Enquiry date",
  "Phone",
  "Email",
  "Referrer",
  "Stage",
] as const;

function pickColumns(source: Record<string, string | number>, columns: readonly string[]) {
  const row: Record<string, string | number> = {};
  for (const column of columns) row[column] = source[column] ?? "";
  return row;
}

function peopleRows(people: Person[], columns: readonly string[]) {
  const names = new Map(listUsers().map((user) => [user.id, user.name]));
  return people.map((person) =>
    pickColumns(personColumns(person, names.get(person.assigned_to_user_id) ?? ""), columns),
  );
}

function houseRows(board: HouseOccupancyView) {
  const rows: Record<string, string | number>[] = [];
  for (const room of board.rooms) {
    for (const bed of room.beds) {
      rows.push({
        Room: room.name,
        Bed: bed.label,
        Status: bed.status,
        Patient: bed.patientName,
        "Admission date": dateOnly(bed.admissionDate),
        "Within client id": bed.clientId,
      });
    }
  }
  for (const person of board.unassigned) {
    if (!person.patientName && !person.clientId) continue;
    rows.push({
      Room: "Not yet allocated",
      Bed: "",
      Status: "occupied",
      Patient: person.patientName,
      "Admission date": dateOnly(person.admissionDate),
      "Within client id": person.clientId,
    });
  }
  return rows;
}

const HOUSE_COLUMNS = ["Room", "Bed", "Status", "Patient", "Admission date", "Within client id"];

async function rowsFor(
  list: ExportList,
  search: URLSearchParams,
  readOccupancy: (house: House) => Promise<HouseOccupancyView>,
): Promise<{ sheet: string; columns: string[]; rows: Record<string, string | number>[] }> {
  const stage = STAGE_BY_LIST[list];
  if (stage) {
    return {
      sheet: STAGE_LABEL[stage],
      columns: [...PIPELINE_COLUMNS],
      rows: peopleRows(listPeopleByStage(stage), PIPELINE_COLUMNS),
    };
  }
  if (list === "admitted") {
    return {
      sheet: "Admitted",
      columns: [...ADMITTED_COLUMNS],
      rows: peopleRows(listAdmittedHistory(), ADMITTED_COLUMNS),
    };
  }
  if (list === "not-admitted") {
    return {
      sheet: "Not admitted",
      columns: [...NOT_ADMITTED_COLUMNS],
      rows: peopleRows(listNotAdmittedHistory(), NOT_ADMITTED_COLUMNS),
    };
  }
  if (list === "manor" || list === "lodge") {
    const house: House = list === "manor" ? "manor" : "lodge";
    const board = await readOccupancy(house);
    return {
      sheet: house === "manor" ? "Manor" : "Lodge",
      columns: HOUSE_COLUMNS,
      rows: houseRows(board),
    };
  }
  if (list === "accounts") {
    const groupRaw = search.get("group") ?? "all";
    const group: AccountGroup | "all" = ACCOUNT_GROUPS.includes(groupRaw as AccountGroup)
      ? (groupRaw as AccountGroup)
      : "all";
    const rows = listAccountRows(group).map((row) => ({
      Name: `${row.first_name} ${row.last_name}`.trim(),
      Group: ACCOUNT_GROUP_LABEL[row.account_group],
      House: row.house ? HOUSE_SHORT[row.house] : "",
      Currency: row.rate_currency,
      Rate: row.rate_amount,
      "Amount paid": row.amount_paid,
      Total: row.total_amount,
      "Percent paid": row.percent_paid,
      "Last invoice": dateOnly(row.last_invoice_date),
      "Next invoice": dateOnly(row.next_invoice_date),
      "Invoice status": INVOICE_STATUS_LABEL[row.invoice_status] ?? row.invoice_status,
      ARP: row.arp_name,
      "Admission date": dateOnly(row.admission_date),
      "Planned discharge": dateOnly(row.planned_discharge_date),
    }));
    return {
      sheet: "Accounts",
      columns: rows.length > 0 ? Object.keys(rows[0]) : [
        "Name",
        "Group",
        "House",
        "Currency",
        "Rate",
        "Amount paid",
        "Total",
        "Percent paid",
        "Last invoice",
        "Next invoice",
        "Invoice status",
        "ARP",
        "Admission date",
        "Planned discharge",
      ],
      rows,
    };
  }
  if (list === "creditors") {
    const rows = listCreditors().map((creditor) => ({
      Name: creditor.name,
      Facility: creditor.facility === "manor" || creditor.facility === "lodge" ? HOUSE_SHORT[creditor.facility] : "",
      Contact: creditor.contact_name,
      Email: creditor.email,
      Phone: creditor.phone,
      "Account reference": creditor.account_reference,
      Sync: creditor.sync_state,
      Notes: creditor.notes,
    }));
    return {
      sheet: "Creditors",
      columns: [
        "Name",
        "Facility",
        "Contact",
        "Email",
        "Phone",
        "Account reference",
        "Sync",
        "Notes",
      ],
      rows,
    };
  }
  const paymentStatus: Record<string, string> = {
    draft: "Draft",
    pending: "Pending (Sage)",
    sent: "Sent",
    due: "Due",
    paid: "Paid",
    cancelled: "Cancelled",
  };
  const rows = listPaymentInvoices().map((invoice) => ({
    "Invoice number": invoice.invoice_number,
    Client: invoice.client_name,
    Facility: invoice.facility === "manor" || invoice.facility === "lodge" ? HOUSE_SHORT[invoice.facility] : invoice.facility,
    Amount: invoice.amount,
    Currency: invoice.currency,
    Status: paymentStatus[invoice.status] ?? invoice.status,
    Sent: dateOnly(invoice.sent_date),
    Due: dateOnly(invoice.due_date),
    Paid: dateOnly(invoice.paid_date),
    "Insurance ref": invoice.insurance_ref,
  }));
  return {
    sheet: "Invoices",
    columns: [
      "Invoice number",
      "Client",
      "Facility",
      "Amount",
      "Currency",
      "Status",
      "Sent",
      "Due",
      "Paid",
      "Insurance ref",
    ],
    rows,
  };
}

export async function buildXlsx(sheetName: string, columns: string[], rows: Record<string, string | number>[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Reach";
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((header) => ({
    header,
    key: header,
    width: Math.min(36, Math.max(14, header.length + 4)),
  }));
  for (const row of rows) sheet.addRow(row);
  const header = sheet.getRow(1);
  header.font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export type ExportResult =
  | { ok: false; status: 401 | 403 | 404; error: string }
  | { ok: true; status: 200; filename: string; body: Buffer; rowCount: number };

export async function handleListExport(
  list: string,
  user: User | null,
  search: URLSearchParams,
  options: {
    now?: Date;
    readOccupancy?: (house: House) => Promise<HouseOccupancyView>;
  } = {},
): Promise<ExportResult> {
  if (!user) return { ok: false, status: 401, error: "Sign in required." };
  if (!isExportList(list)) return { ok: false, status: 404, error: "Unknown list." };
  if (exportDenied(list, user) === "forbidden") return { ok: false, status: 403, error: "You cannot export that list." };
  const collected = await rowsFor(list, search, options.readOccupancy ?? ((house) => readHouseOccupancy(house)));
  const filename = exportFilename(list, options.now);
  const body = await buildXlsx(collected.sheet, collected.columns, collected.rows);
  writeListExportAudit({
    list,
    actorId: user.id,
    filename,
    rowCount: collected.rows.length,
  });
  return { ok: true, status: 200, filename, body, rowCount: collected.rows.length };
}
