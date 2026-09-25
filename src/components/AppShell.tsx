import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { canManageLeadForms, canViewCreditors, canViewExecutive } from "@/lib/access";
import { FINANCE_NAV, ROLE_LABEL, STAGE_NAV } from "@/lib/labels";
import type { User } from "@/lib/types";
import { BrandMark } from "./BrandMark";

function NavPills({
  items,
  current,
}: {
  items: { href: string; label: string }[];
  current?: string;
}) {
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {items.map((item) => {
        const active = current === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex min-h-11 items-center rounded-full px-3 py-2 ${
              active ? "bg-sage text-paper" : "hover:bg-sand/70"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  user,
  current,
  children,
}: {
  user: User;
  current?: string;
  children: React.ReactNode;
}) {
  const leadership = [
    ...(canViewExecutive(user) ? [{ href: "/executive", label: "Executive" }] : []),
    ...(canViewCreditors(user) ? [{ href: "/creditors", label: "Creditors" }] : []),
    ...(canManageLeadForms(user) ? [{ href: "/lead-forms", label: "Lead forms" }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/enquiries" className="min-w-0">
              <BrandMark variant="header" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm">{user.name}</p>
                <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
              </div>
              <form action={logoutAction}>
                <button type="submit" className="min-h-11 rounded-full border border-line px-4 py-2 text-sm">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          {leadership.length > 0 ? (
            <div className="border-b border-line/70 pb-2">
              <NavPills items={leadership} current={current} />
            </div>
          ) : null}
          <NavPills items={STAGE_NAV} current={current} />
          <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-2">
            <p className="text-xs uppercase tracking-wider text-muted">Finance / Admin</p>
            <NavPills items={FINANCE_NAV} current={current} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
