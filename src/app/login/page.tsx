import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/components/LoginForm";

const accounts = [
  { role: "Therapist", email: "therapist@liberty.local" },
  { role: "Admissions", email: "admissions@liberty.local" },
  { role: "Accounts", email: "accounts@liberty.local" },
  { role: "Finance", email: "finance@liberty.local" },
  { role: "Executive", email: "executive@liberty.local" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <BrandMark variant="lockup" />
      <p className="mt-4 text-lg leading-relaxed text-ink/90">
        Commercial enquiry CRM for Weltevreden Manor and Liberty Lodge. Clinical files live in Within after
        admit. Alumni is Beyond.
      </p>
      <LoginForm nextPath={params.next ?? ""} />
      <p className="mt-4 text-sm text-muted">
        QA uses the demo password below. Production sign-in will be Microsoft 365 with MFA.
      </p>
      <div className="mt-6 rounded-3xl border border-dashed border-line p-5 text-sm text-muted">
        <p className="font-medium text-ink">Demo staff (password: liberty)</p>
        <ul className="mt-2 space-y-1">
          {accounts.map((account) => (
            <li key={account.email}>
              {account.role}: {account.email}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
