"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction } from "@/app/actions";
import type { LoginAccount } from "@/lib/demo-login";

export function LoginForm({
  nextPath = "",
  quickPicks = [],
  prefillEmail = "",
  prefillPassword = "",
}: {
  nextPath?: string;
  quickPicks?: LoginAccount[];
  prefillEmail?: string;
  prefillPassword?: string;
}) {
  const [state, action, pending] = useActionState(loginAction, null);
  const [email, setEmail] = useState(prefillEmail);
  const quickKey = quickPicks.map((account) => account.email).join(",");

  useEffect(() => {
    if (!quickKey) return;
    const next = nextPath || new URLSearchParams(window.location.search).get("next") || "";
    if (!next.includes("approval") && !next.includes("accounts")) return;
    const accountsEmail = quickKey.split(",").find((value) => value.startsWith("accounts@"));
    if (accountsEmail) setEmail(accountsEmail);
  }, [nextPath, quickKey]);

  return (
    <form action={action} className="mt-8 space-y-4 rounded-3xl border border-line bg-paper p-6">
      <input type="hidden" name="next" value={nextPath} />
      {quickPicks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {quickPicks.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => setEmail(account.email)}
              className={`min-h-10 rounded-full border px-3 text-xs ${
                email === account.email ? "border-sage bg-sage text-paper" : "border-line"
              }`}
            >
              {account.role}
            </button>
          ))}
        </div>
      ) : null}
      <label className="block">
        <span className="text-sm font-medium">Staff email</span>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          defaultValue={prefillPassword}
          autoComplete="current-password"
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
        />
      </label>
      {state?.error ? <p className="text-sm text-terracotta">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-full bg-sage text-paper disabled:opacity-70"
      >
        {pending ? "Signing in…" : "Enter Reach"}
      </button>
    </form>
  );
}
