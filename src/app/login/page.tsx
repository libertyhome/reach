import { LoginScreen } from "@/components/LoginScreen";
import { demoLoginEnabled } from "@/lib/demo-login";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return <LoginScreen demo={demoLoginEnabled()} nextPath={params.next ?? ""} />;
}
