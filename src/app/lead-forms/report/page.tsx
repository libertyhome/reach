import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { enquirySourceMonths, enquirySourceReport } from "@/lib/lead-forms";
import { requireLeadFormAdmin } from "@/lib/page-helpers";

export const dynamic = "force-dynamic";

function monthLabel(month: string) {
  const [year, raw] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(raw) - 1, 1));
  return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export default async function LeadFormReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireLeadFormAdmin();
  const params = await searchParams;
  const months = enquirySourceMonths();
  const selected = params.month && (params.month === "all" || months.includes(params.month)) ? params.month : "all";
  const rows = enquirySourceReport(selected);
  const total = rows.reduce((sum, row) => sum + row.enquiries, 0);

  return (
    <AppShell user={user} current="/lead-forms">
      <p className="text-sm text-muted">
        <Link href="/lead-forms" className="underline-offset-2 hover:underline">
          Lead forms
        </Link>
      </p>
      <h1 className="serif mt-2 text-4xl text-sage-deep">Enquiries by source</h1>
      <p className="mt-2 max-w-2xl text-muted">
        New enquiries from lead forms, grouped by month, source, and campaign. A repeat call within 24 hours stays on the original enquiry and is not counted again. Months use Africa/Johannesburg.
      </p>
      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label>
          <span className="text-sm font-medium">Month</span>
          <select name="month" defaultValue={selected} className="mt-1 min-h-12 rounded-xl border border-line bg-paper px-3">
            <option value="all">All months</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-12 rounded-full border border-line px-5">
          Show
        </button>
      </form>
      <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-paper">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Month</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 text-right font-medium">Enquiries</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted">
                  No lead-form enquiries for this month yet.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={`${row.month}-${row.source}-${row.campaign}`} className="border-b border-line/70">
                <td className="px-4 py-3">{monthLabel(row.month)}</td>
                <td className="px-4 py-3">{row.sourceLabel}</td>
                <td className="px-4 py-3">{row.campaign === "(none)" ? "—" : row.campaign}</td>
                <td className="px-4 py-3 text-right">{row.enquiries}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr>
                <td className="px-4 py-3 font-medium" colSpan={3}>
                  Total
                </td>
                <td className="px-4 py-3 text-right font-medium">{total}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </AppShell>
  );
}
