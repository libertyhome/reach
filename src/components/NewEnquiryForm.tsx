import { createEnquiryAction } from "@/app/actions";
import { LeadSourceFields } from "@/components/LeadSourceFields";
import {
  CONTACT_METHODS,
  CONTACT_METHOD_LABEL,
  type User,
} from "@/lib/types";

export function NewEnquiryForm({ staff, currentUserId }: { staff: User[]; currentUserId: string }) {
  return (
    <form action={createEnquiryAction} className="mt-8 max-w-xl space-y-4 rounded-3xl border border-line bg-paper p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Caller name</span>
          <input name="caller_name" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Resident name</span>
          <input name="resident_name" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
      </div>
      <p className="text-sm text-muted">The caller is not always the resident. First and last name are the name on this file.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">First name</span>
          <input name="first_name" required className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Last name</span>
          <input name="last_name" required className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium">Preferred name</span>
        <input name="preferred_name" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Phone</span>
        <input name="phone" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input name="email" type="email" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Method of contact</span>
        <select name="contact_method" defaultValue="phone" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
          {CONTACT_METHODS.map((method) => (
            <option key={method} value={method}>
              {CONTACT_METHOD_LABEL[method]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Assign enquiry to</span>
        <select name="assigned_to_user_id" defaultValue={currentUserId} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} · {member.role}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Referral owner</span>
        <select name="referral_owner_user_id" defaultValue={currentUserId} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Referrer / agency</span>
          <input name="referrer_name" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Referrer contact person</span>
          <input name="referrer_contact_person" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Referrer phone</span>
          <input name="referrer_phone" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
      </div>
      <LeadSourceFields leadSource="" leadSourceNote="" leadSourceWho="" />
      <p className="text-sm text-muted">Lead source is a label only. It does not move or archive this card.</p>
      <label className="block">
        <span className="text-sm font-medium">Notes</span>
        <textarea name="commercial_notes" rows={4} className="mt-1 w-full rounded-xl border border-line bg-linen px-3 py-2" />
      </label>
      <button type="submit" className="min-h-12 w-full rounded-full bg-sage text-paper">
        Save enquiry
      </button>
    </form>
  );
}
