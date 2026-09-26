import { AppShell } from "@/components/AppShell";
import { addStaffAction, setStaffDisabledAction, unlinkMicrosoftAction, updateStaffRoleAction } from "@/app/staff-actions";
import { ROLE_LABEL } from "@/lib/labels";
import { requireExecutiveAccess } from "@/lib/page-helpers";
import { ROLES } from "@/lib/types";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await requireExecutiveAccess();
  const params = await searchParams;
  const staff = listUsers();
  return (
    <AppShell user={user} current="/staff">
      <h1 className="serif text-4xl text-sage-deep">Staff access</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        People sign in with the Microsoft email listed here. New rows do not get a usable password. Disable someone
        to stop sign-in without deleting their history.
      </p>
      {params.error ? <p className="mt-4 text-sm text-terracotta">{params.error}</p> : null}
      {params.notice ? <p className="mt-4 text-sm text-sage-deep">{params.notice}</p> : null}

      <form action={addStaffAction} className="mt-6 grid gap-3 rounded-3xl border border-line bg-paper p-5 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input name="name" required className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Role</span>
          <select name="role" required className="mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="min-h-11 w-full rounded-full bg-sage px-4 text-paper">
            Add staff
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {staff.map((member) => (
          <article key={member.id} className="rounded-3xl border border-line bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{member.name}</p>
                <p className="text-sm text-muted">{member.email}</p>
                <p className="mt-1 text-xs text-muted">
                  Microsoft {member.entra_oid ? "linked" : "not linked"}
                  {member.auth_disabled ? " · disabled" : ""}
                  {member.last_login_at ? ` · last sign-in ${member.last_login_at.replace("T", " ").slice(0, 16)}` : ""}
                </p>
              </div>
              <form action={updateStaffRoleAction} className="flex items-center gap-2">
                <input type="hidden" name="userId" value={member.id} />
                <select name="role" defaultValue={member.role} className="min-h-11 rounded-xl border border-line bg-linen px-3">
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
                <button type="submit" className="min-h-11 rounded-full border border-line px-4 text-sm">
                  Save role
                </button>
              </form>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={setStaffDisabledAction}>
                <input type="hidden" name="userId" value={member.id} />
                <input type="hidden" name="disabled" value={member.auth_disabled ? "0" : "1"} />
                <button type="submit" className="min-h-10 rounded-full border border-line px-4 text-sm">
                  {member.auth_disabled ? "Enable" : "Disable"}
                </button>
              </form>
              {member.entra_oid ? (
                <form action={unlinkMicrosoftAction}>
                  <input type="hidden" name="userId" value={member.id} />
                  <button type="submit" className="min-h-10 rounded-full border border-line px-4 text-sm">
                    Unlink Microsoft
                  </button>
                </form>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
