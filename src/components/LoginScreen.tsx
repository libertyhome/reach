import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/components/LoginForm";
import { loginPresentation } from "@/lib/demo-login";

export function LoginScreen({
  demo,
  nextPath,
  microsoftHref = "",
  showPassword = true,
  notConfigured = false,
  note,
  error = "",
}: {
  demo: boolean;
  nextPath: string;
  microsoftHref?: string;
  showPassword?: boolean;
  notConfigured?: boolean;
  note?: string;
  error?: string;
}) {
  const presentation = loginPresentation(demo);
  const footnote = note ?? (presentation.demoNote || "Sign in with your Reach staff account.");
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <BrandMark variant="lockup" />
      <p className="mt-4 text-lg leading-relaxed text-ink/90">
        Commercial enquiry CRM for Weltevreden Manor and Liberty Lodge. Clinical files live in Within after
        admit. Alumni is Beyond.
      </p>
      {notConfigured ? (
        <div className="mt-8 rounded-3xl border border-line bg-paper p-6">
          <p className="font-medium">Microsoft sign-in is not configured</p>
          <p className="mt-2 text-sm text-muted">
            Reach will not accept a password until Microsoft Entra sign-in is set up. Ask the executive desk.
          </p>
        </div>
      ) : null}
      {microsoftHref ? (
        <a
          href={microsoftHref}
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-sage px-5 text-paper"
        >
          Sign in with Microsoft
        </a>
      ) : null}
      {showPassword ? (
        <LoginForm
          nextPath={nextPath}
          quickPicks={presentation.quickPicks}
          prefillEmail={presentation.prefillEmail}
          prefillPassword={presentation.prefillPassword}
        />
      ) : null}
      {error ? <p className="mt-4 text-sm text-terracotta">{error}</p> : null}
      <p className="mt-4 text-sm text-muted">{footnote}</p>
      {presentation.accounts.length > 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-line p-5 text-sm text-muted">
          <p className="font-medium text-ink">{presentation.demoHeading}</p>
          <ul className="mt-2 space-y-1">
            {presentation.accounts.map((account) => (
              <li key={account.email}>
                {account.role}: {account.email}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
