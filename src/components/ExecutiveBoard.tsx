import Link from "next/link";
import { ChartLegend, LineChart, PieChart, chartColor } from "@/components/Charts";
import type { ExecutiveAnalytics, OccupancySnapshot } from "@/lib/executive";
import { HOUSE_SHORT, LEAD_SOURCE_LABEL, STAGE_LABEL } from "@/lib/labels";
import { HOUSES, LEAD_SOURCES, PROGRAM_PHASES } from "@/lib/types";

function monthLabel(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

export function ExecutiveBoard({
  snapshot,
  analytics,
}: {
  snapshot: OccupancySnapshot;
  analytics: ExecutiveAnalytics;
}) {
  const filters = analytics.filters;
  const enquirySeries = [{ name: "Enquiries", color: chartColor(0), values: analytics.enquiryVolume.map((point) => point.values[0] ?? 0) }];
  const admissionSeries = [
    {
      name: "Admissions",
      color: chartColor(1),
      values: analytics.admissionsOverTime.map((point) => point.values[0] ?? 0),
    },
  ];
  const leadSeries = analytics.leadSourceSeries.map((series, index) => ({
    name: series.label,
    color: chartColor(index),
    values: analytics.leadSourceTrend.map((point) => point.values[index] ?? 0),
  }));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="serif text-4xl text-sage-deep">Executive</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Occupancy and enquiry analytics for Manor and Lodge. The Monday.com occupancy email still runs in
          parallel — this page does not replace it.
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="serif text-2xl text-sage-deep">Occupancy</h2>
          <p className="text-sm text-muted">As of {snapshot.asOf}</p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {snapshot.facilities.map((facility) => (
            <article key={facility.house} className="rounded-3xl border border-line bg-paper p-5">
              <p className="text-xs uppercase tracking-wider text-muted">{facility.label}</p>
              <p className="serif mt-1 text-3xl text-sage-deep">
                {facility.occupied} of {facility.capacity}
              </p>
              <p className="text-sm text-muted">{facility.percent}% occupied</p>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {facility.phases.map((phase) => (
                  <li key={phase.label} className="rounded-2xl bg-linen px-3 py-2">
                    <span className="text-muted">{phase.label}</span>
                    <span className="mt-1 block text-base">
                      {phase.occupied} · {phase.percentOfCapacity}% of beds
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-3xl border border-line bg-paper p-5">
            <p className="text-xs uppercase tracking-wider text-muted">MTD enquiries · {monthLabel(snapshot.mtd.month)}</p>
            <p className="serif mt-1 text-3xl text-sage-deep">{snapshot.mtd.enquiries}</p>
          </article>
          <article className="rounded-3xl border border-line bg-paper p-5">
            <p className="text-xs uppercase tracking-wider text-muted">MTD admissions · {monthLabel(snapshot.mtd.month)}</p>
            <p className="serif mt-1 text-3xl text-sage-deep">{snapshot.mtd.admissions}</p>
          </article>
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-paper">
          <table className="min-w-[960px] w-full text-left text-sm">
            <caption className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted">
              Current residents
            </caption>
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                {[
                  "Name",
                  "Facility",
                  "Phase",
                  "Admitted",
                  "Planned discharge",
                  "Lead source",
                  "Contact",
                  "Referrer",
                  "Referrer contact",
                  "Referral owner",
                ].map((heading) => (
                  <th key={heading} className="px-3 py-2 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.residents.map((row) => (
                <tr key={row.id} className="border-t border-line/70">
                  <td className="px-3 py-2">
                    <Link href={`/people/${row.id}`} className="hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.facility || "—"}</td>
                  <td className="px-3 py-2">{row.phase || "—"}</td>
                  <td className="px-3 py-2">{row.admission_date || "—"}</td>
                  <td className="px-3 py-2">{row.planned_discharge_date || "—"}</td>
                  <td className="px-3 py-2">{row.lead_source || "—"}</td>
                  <td className="px-3 py-2">{row.method_of_contact || "—"}</td>
                  <td className="px-3 py-2">{row.referrer || "—"}</td>
                  <td className="px-3 py-2">
                    {[row.referrer_contact_person, row.referrer_phone].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2">{row.referral_owner || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <MovementList title="Confirmed upcoming arrivals" rows={snapshot.arrivals} empty="No confirmed arrivals dated today or later." />
          <MovementList title="Planned discharges" rows={snapshot.discharges} empty="No planned discharges dated today or later." />
        </div>

        <section className="mt-4 rounded-3xl border border-line bg-paper p-5">
          <h3 className="serif text-2xl text-sage-deep">Enquiry and admission hygiene</h3>
          <p className="mt-1 text-sm text-muted">
            Open commercial gates on enquiries through admit. Urgent when the same gate has been uncleared more
            than once in the audit history.
          </p>
          {snapshot.hygiene.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No open hygiene flags.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {snapshot.hygiene.map((flag) => (
                <li key={flag.personId} className="rounded-2xl border border-line/80 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/people/${flag.personId}`} className="hover:underline">
                      {flag.name}
                    </Link>
                    <span className="text-xs uppercase tracking-wider text-muted">{STAGE_LABEL[flag.stage]}</span>
                    {flag.urgent ? (
                      <span className="rounded-full bg-terracotta px-2 py-0.5 text-xs text-paper">Urgent</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">{flag.openGates.join(" · ")}</p>
                  {flag.repeatUncleared.length > 0 ? (
                    <p className="mt-1 text-sm text-terracotta">
                      {flag.repeatUncleared.map((item) => `${item.gate} uncleared ${item.times} times`).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      <section>
        <h2 className="serif text-2xl text-sage-deep">Analytics</h2>
        <form method="get" action="/executive" className="mt-4 grid gap-3 rounded-3xl border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            From
            <input type="date" name="from" defaultValue={filters.from} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
          <label className="block text-sm">
            To
            <input type="date" name="to" defaultValue={filters.to} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
          <label className="block text-sm">
            Facility
            <select name="facility" defaultValue={filters.facility} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3">
              <option value="all">Manor and Lodge</option>
              {HOUSES.map((house) => (
                <option key={house} value={house}>
                  {HOUSE_SHORT[house]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Phase
            <select name="phase" defaultValue={filters.phase} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3">
              <option value="all">All phases</option>
              {PROGRAM_PHASES.map((phase) => (
                <option key={phase} value={phase}>
                  Phase {phase}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Lead source
            <select name="leadSource" defaultValue={filters.leadSource} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3">
              <option value="all">All sources</option>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {LEAD_SOURCE_LABEL[source]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Referrer
            <select name="referrer" defaultValue={filters.referrer} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3">
              <option value="all">All referrers</option>
              {analytics.referrerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Referral owner
            <select name="owner" defaultValue={filters.owner} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3">
              <option value="all">All owners</option>
              {analytics.ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="min-h-11 rounded-full bg-sage px-4 text-sm text-paper">
              Apply filters
            </button>
          </div>
        </form>
        {filters.rangeClamped ? (
          <p className="mt-2 text-sm text-muted">Date range capped at 366 days.</p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <article className="rounded-3xl border border-line bg-paper p-5">
            <p className="text-xs uppercase tracking-wider text-muted">Enquiries in range</p>
            <p className="serif mt-1 text-3xl text-sage-deep">{analytics.enquiryCount}</p>
          </article>
          <article className="rounded-3xl border border-line bg-paper p-5">
            <p className="text-xs uppercase tracking-wider text-muted">Admitted from these enquiries</p>
            <p className="serif mt-1 text-3xl text-sage-deep">{analytics.cohortAdmitted}</p>
          </article>
          <article className="rounded-3xl border border-line bg-paper p-5">
            <p className="text-xs uppercase tracking-wider text-muted">Conversion</p>
            <p className="serif mt-1 text-3xl text-sage-deep">
              {analytics.conversionPercent === null ? "—" : `${analytics.conversionPercent}%`}
            </p>
          </article>
        </div>

        <article className="mt-4 rounded-3xl border border-line bg-paper p-5">
          <h3 className="serif text-2xl text-sage-deep">Enquiry volume</h3>
          <p className="mt-1 text-sm text-muted">Counted on enquiry date. Conversion above is the share of these enquiries that have an admission on record.</p>
          {analytics.enquiryCount === 0 ? (
            <p className="mt-4 text-sm text-muted">No enquiries in this filter.</p>
          ) : (
            <>
              <LineChart points={analytics.enquiryVolume} series={enquirySeries} />
              <ChartLegend series={enquirySeries} />
            </>
          )}
        </article>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-line bg-paper p-5">
            <h3 className="serif text-2xl text-sage-deep">Lead sources</h3>
            {analytics.leadSourcePie.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No enquiries in this filter.</p>
            ) : (
              <div className="mt-4">
                <PieChart
                  slices={analytics.leadSourcePie.map((slice, index) => ({
                    label: slice.label,
                    value: slice.value,
                    color: chartColor(index),
                  }))}
                />
              </div>
            )}
          </article>
          <article className="rounded-3xl border border-line bg-paper p-5">
            <h3 className="serif text-2xl text-sage-deep">Lead source trend</h3>
            {leadSeries.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No enquiries in this filter.</p>
            ) : (
              <>
                <LineChart points={analytics.leadSourceTrend} series={leadSeries} />
                <ChartLegend series={leadSeries} />
              </>
            )}
          </article>
        </div>

        <article className="mt-4 rounded-3xl border border-line bg-paper p-5">
          <h3 className="serif text-2xl text-sage-deep">Admissions over time</h3>
          <p className="mt-1 text-sm text-muted">
            Admitted residents whose admission date falls in this filter. {analytics.admissionEventCount} in range.
          </p>
          {analytics.admissionEventCount === 0 ? (
            <p className="mt-4 text-sm text-muted">No admissions in this filter.</p>
          ) : (
            <>
              <LineChart points={analytics.admissionsOverTime} series={admissionSeries} />
              <ChartLegend series={admissionSeries} />
            </>
          )}
        </article>

        <article className="mt-4 rounded-3xl border border-dashed border-line bg-paper p-5">
          <h3 className="serif text-2xl text-sage-deep">Demographics</h3>
          <p className="mt-2 text-sm text-muted">{analytics.demographics.todo}</p>
        </article>
      </section>
    </div>
  );
}

function MovementList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: OccupancySnapshot["arrivals"];
  empty: string;
}) {
  return (
    <section className="rounded-3xl border border-line bg-paper p-5">
      <h3 className="serif text-2xl text-sage-deep">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {rows.map((row) => (
            <li key={row.id} className="border-t border-line/70 pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/people/${row.id}`} className="hover:underline">
                  {row.name}
                </Link>
                <span className="text-sm text-muted">{row.date}</span>
              </div>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <Field label="Facility" value={row.facility} />
                <Field label="Phase" value={row.phase} />
                <Field label="Lead source" value={row.leadSource} />
                <Field label="Method of contact" value={row.methodOfContact} />
                <Field label="Referrer" value={row.referrer} />
                <Field label="Referrer contact" value={row.referrerContact} />
                <Field label="Referral owner" value={row.referralOwner} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
