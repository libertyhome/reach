import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/components/LoginForm";
import { loginPresentation } from "@/lib/demo-login";

export function LoginScreen({ demo, nextPath }: { demo: boolean; nextPath: string }) {
  const presentation = loginPresentation(demo);
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <BrandMark variant="lockup" />
      <p className="mt-4 text-lg leading-relaxed text-ink/90">
        Commercial enquiry CRM for Weltevreden Manor and Liberty Lodge. Clinical files live in Within after
        admit. Alumni is Beyond.
      </p>
      <LoginForm
        nextPath={nextPath}
        quickPicks={presentation.quickPicks}
        prefillEmail={presentation.prefillEmail}
        prefillPassword={presentation.prefillPassword}
      />
      {presentation.demoNote ? (
        <p className="mt-4 text-sm text-muted">{presentation.demoNote}</p>
      ) : (
        <p className="mt-4 text-sm text-muted">Sign in with your Reach staff account.</p>
      )}
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
