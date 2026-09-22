import Link from "next/link";
import { DirectoryDrawer } from "@/components/DirectoryDrawer";
import {
  SA_AUTH_LABEL,
  SA_MOTIVATION_LABEL,
  type SaMedicalAidRow,
  type SaScheme,
} from "@/lib/finance-types";
import { HOUSE_SHORT, personDisplayName } from "@/lib/labels";

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function SaMedicalAidBoard({
  apps,
  schemes,
}: {
  apps: SaMedicalAidRow[];
  schemes: SaScheme[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="serif text-4xl text-sage-deep">SA Medical Aid</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Pre-authorisation for Discovery, GEMS, and other SA schemes — kept separate from Dutch insurance.
          </p>
        </div>
        <DirectoryDrawer title="Scheme directory" triggerLabel="Scheme directory">
          <ul className="space-y-4">
            {schemes.map((scheme) => (
              <li key={scheme.id} className="rounded-2xl border border-line p-4">
                <p className="font-medium">{scheme.name}</p>
                <p className="mt-1 text-sm">{scheme.contact_email || "—"}</p>
                <p className="text-sm text-muted">{scheme.contact_phone || "—"}</p>
                <p className="mt-2 text-xs text-muted">{scheme.portal_url || "—"}</p>
                {scheme.notes ? <p className="mt-2 text-sm text-muted">{scheme.notes}</p> : null}
              </li>
            ))}
          </ul>
        </DirectoryDrawer>
      </div>

      <div className="mt-8 grid gap-4">
        {apps.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-muted">No SA medical aid apps yet.</p>
        ) : null}
        {apps.map((app) => (
          <article key={app.id} className="rounded-3xl border border-line bg-paper p-5">
            <div>
              <Link href={`/people/${app.person_id}`} className="serif text-2xl text-sage-deep hover:underline">
                {personDisplayName(app)}
              </Link>
              <p className="mt-1 text-sm text-muted">
                {app.scheme_name} · {app.house ? HOUSE_SHORT[app.house] : "—"} · {SA_AUTH_LABEL[app.auth_status]}
                {app.pmb ? " · PMB" : ""}
              </p>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Submitted</dt>
                <dd>{app.submitted_date || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Approved</dt>
                <dd>
                  {app.approved_amount > 0 ? money(app.approved_amount, app.currency) : "—"} · {app.currency}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Co-pay</dt>
                <dd>{app.co_pay_amount > 0 ? money(app.co_pay_amount, app.currency) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Clinical motivation</dt>
                <dd>{SA_MOTIVATION_LABEL[app.clinical_motivation_status]}</dd>
              </div>
            </dl>
            {app.notes ? <p className="mt-3 text-sm text-muted">{app.notes}</p> : null}
          </article>
        ))}
      </div>
    </>
  );
}
