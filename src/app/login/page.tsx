import { LoginScreen } from "@/components/LoginScreen";
import { loginPageModel } from "@/lib/auth-mode";
import { demoLoginEnabled } from "@/lib/demo-login";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const model = loginPageModel();
  const nextPath = params.next ? safeNext(params.next) : "";
  const demo = model.provider === "demo" && demoLoginEnabled();
  return (
    <LoginScreen
      demo={demo}
      nextPath={nextPath}
      microsoftHref={model.microsoft ? `/api/auth/signin?next=${encodeURIComponent(nextPath)}` : ""}
      showPassword={model.password}
      notConfigured={model.notConfigured}
      note={model.provider === "demo" ? undefined : model.note}
      error={params.error === "microsoft" ? "Microsoft sign-in could not be started. Try again." : ""}
    />
  );
}
