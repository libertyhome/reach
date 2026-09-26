import { updateFieldsAction, updateLeadSourceAction } from "@/app/actions";
import { AddonDaysField } from "@/components/AddonDaysField";
import { LeadSourceFields } from "@/components/LeadSourceFields";
import { HOUSE_SHORT, NOT_CONVERTED_REASON_LABEL } from "@/lib/labels";
import {
  COMMERCIAL_ADDONS,
  CONTACT_METHODS,
  CONTACT_METHOD_LABEL,
  CURRENCIES,
  CURRENCY_LABEL,
  FUNDING_TYPES,
  HOUSES,
  NOT_CONVERTED_REASONS,
  type Person,
  type User,
} from "@/lib/types";

export function personDetailsFormId(personId: string) {
  return `person-details-${personId}`;
}

export function personLeadFormId(personId: string) {
  return `person-lead-${personId}`;
}

export function ArpFields({ person, formId }: { person: Person; formId: string }) {
  return (
    <section className="rounded-3xl border border-line bg-paper p-6">
      <h2 className="serif text-2xl text-sage-deep">ARP</h2>
      <p className="mt-2 text-sm text-muted">
        Account-responsible person. This is the person on the file, not the ARF form.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">ARP name</span>
          <input
            form={formId}
            name="next_of_kin_name"
            defaultValue={person.next_of_kin_name}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">ARP phone</span>
          <input
            form={formId}
            name="next_of_kin_phone"
            defaultValue={person.next_of_kin_phone}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">ARP email</span>
          <input
            form={formId}
            name="arp_email"
            type="email"
            defaultValue={person.arp_email}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          />
        </label>
      </div>
      <button type="submit" form={formId} className="mt-4 min-h-12 rounded-full bg-sage px-5 text-paper">
        Save details
      </button>
    </section>
  );
}

export function PersonEditor({ person, staff }: { person: Person; staff: User[] }) {
  const detailsId = personDetailsFormId(person.id);
  const leadId = personLeadFormId(person.id);
  return (
    <div>
      <form id={leadId} action={updateLeadSourceAction} className="hidden">
        <input type="hidden" name="id" value={person.id} />
      </form>
      <form id={detailsId} action={updateFieldsAction} className="space-y-4 rounded-3xl border border-line bg-paper p-6">
        <input type="hidden" name="id" value={person.id} />
        <h2 className="serif text-2xl text-sage-deep">Commercial details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">First name</span>
            <input name="first_name" defaultValue={person.first_name} required className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Last name</span>
            <input name="last_name" defaultValue={person.last_name} required className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium">Preferred name</span>
          <input name="preferred_name" defaultValue={person.preferred_name} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Caller name</span>
            <input name="caller_name" defaultValue={person.caller_name} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Resident name</span>
            <input name="resident_name" defaultValue={person.resident_name} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
        </div>
        <p className="text-sm text-muted">The caller is not always the resident.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Phone</span>
            <input name="phone" defaultValue={person.phone} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input name="email" type="email" defaultValue={person.email} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Method of contact</span>
            <select name="contact_method" defaultValue={person.contact_method || ""} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
              <option value="">Not set</option>
              {CONTACT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {CONTACT_METHOD_LABEL[method]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Assigned to (enquiry owner)</span>
            <select name="assigned_to_user_id" defaultValue={person.assigned_to_user_id} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
              <option value="">Unassigned</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.role}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Referral owner</span>
            <select name="referral_owner_user_id" defaultValue={person.referral_owner_user_id} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
              <option value="">Unassigned</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Counsellor</span>
            <select name="counsellor_user_id" defaultValue={person.counsellor_user_id} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
              <option value="">Not assigned yet</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.role}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">Usually set on Admit; editable anytime after.</span>
          </label>
        </div>
        <fieldset className="rounded-2xl border border-line bg-linen px-4 py-3">
          <legend className="px-1 text-sm font-medium">Lead source</legend>
          <p className="mb-3 text-xs text-muted">
            A label for how they found us. Changing it never moves the card or archives it.
          </p>
          <div className="space-y-3">
            <LeadSourceFields
              formId={leadId}
              leadSource={person.lead_source}
              leadSourceNote={person.lead_source_note}
              leadSourceWho={person.lead_source_who}
            />
            <button type="submit" form={leadId} className="min-h-12 rounded-full border border-line bg-paper px-5">
              Save lead source
            </button>
          </div>
        </fieldset>
        <fieldset className="rounded-2xl border border-line bg-linen px-4 py-3">
          <legend className="px-1 text-sm font-medium">Referrer</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">Referrer / agency</span>
              <input name="referrer_name" defaultValue={person.referrer_name} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-paper px-3" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Contact person</span>
              <input name="referrer_contact_person" defaultValue={person.referrer_contact_person} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-paper px-3" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Referrer phone</span>
              <input name="referrer_phone" defaultValue={person.referrer_phone} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-paper px-3" />
            </label>
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Funding</span>
            <select name="funding_type" defaultValue={person.funding_type} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
              {FUNDING_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Currency</span>
            <select name="currency" defaultValue={person.currency || "ZAR"} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {CURRENCY_LABEL[code]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium">Funding notes</span>
          <input name="funding_notes" defaultValue={person.funding_notes} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium">Expected arrival</span>
            <input name="expected_arrival" type="date" defaultValue={person.expected_arrival} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Admission date</span>
            <input name="admission_date" type="date" defaultValue={person.admission_date} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Planned discharge</span>
            <input name="planned_discharge_date" type="date" defaultValue={person.planned_discharge_date} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium">House preference</span>
          <select name="house_preference" defaultValue={person.house_preference} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
            <option value="">Not set</option>
            <option value="either">Either</option>
            {HOUSES.map((house) => (
              <option key={house} value={house}>
                {HOUSE_SHORT[house]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="rounded-2xl border border-line bg-linen px-4 py-3">
          <legend className="px-1 text-sm font-medium">Assessment</legend>
          <label className="block">
            <span className="text-sm font-medium">Assessment details</span>
            <textarea name="assessment_details" rows={3} defaultValue={person.assessment_details} className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" />
          </label>
          <label className="mt-3 block">
            <span className="text-sm font-medium">Assessment notes</span>
            <textarea name="assessment_notes" rows={3} defaultValue={person.assessment_notes} className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" />
          </label>
        </fieldset>
        <fieldset className="rounded-2xl border border-line bg-linen px-4 py-3">
          <legend className="px-1 text-sm font-medium">Commercial add-ons</legend>
          <p className="mb-3 text-xs text-muted">
            Optional line items for the commercial file. Detox/overnight supervision keeps its own day count here.
            Nursing & medical admission is a single day when it is ticked. Treatment that starts with detox is
            confirmed on Admit; that day count is what Within receives.
          </p>
          <ul className="space-y-2">
            <AddonDaysField
              name="addon_detox_overnight"
              daysName="addon_detox_overnight_days"
              label="Detox/overnight supervision"
              checked={person.addon_detox_overnight === 1 || person.addon_overnight_supervision === 1}
              days={person.addon_detox_overnight_days}
              hint="Replaces overnight supervision. Leave days unset when they were not recorded."
            />
            <li className="rounded-xl border border-line bg-paper px-3 py-2">
              <label className="flex min-h-10 items-center gap-3">
                <input
                  type="checkbox"
                  name="addon_nursing_medical_admission"
                  value="1"
                  defaultChecked={person.addon_nursing_medical_admission === 1}
                  className="h-5 w-5 accent-[var(--sage)]"
                />
                <span>Nursing & medical admission</span>
              </label>
            </li>
            {COMMERCIAL_ADDONS.map((item) => (
              <li key={item.key}>
                <label className="flex min-h-10 items-center gap-3">
                  <input
                    type="checkbox"
                    name={item.key}
                    value="1"
                    defaultChecked={person[item.key] === 1}
                    className="h-5 w-5 accent-[var(--sage)]"
                  />
                  <span>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <label className="block">
          <span className="text-sm font-medium">Notes</span>
          <textarea name="commercial_notes" rows={4} defaultValue={person.commercial_notes} className="mt-1 w-full rounded-xl border border-line bg-linen px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Reason for not converting</span>
          <select name="not_converted_reason" defaultValue={person.not_converted_reason} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
            <option value="">Not set</option>
            {NOT_CONVERTED_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {NOT_CONVERTED_REASON_LABEL[reason]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-12 rounded-full bg-sage px-5 text-paper">
          Save details
        </button>
      </form>
    </div>
  );
}
