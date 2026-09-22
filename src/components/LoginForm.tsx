"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction } from "@/app/actions";

const DEMO_ACCOUNTS = [
  { role: "Admissions", email: "admissions@liberty.local" },
  { role: "Accounts", email: "accounts@liberty.local" },
  { role: "Therapist", email: "therapist@liberty.local" },
] as const;

export function LoginForm({ nextPath = "" }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const [email, setEmail] = useState("admissions@liberty.local");

  useEffect(() => {
    // Prefer Accounts when the return URL looks commercial (approval / admit checklist).
    if (typeof window === "undefined") return;
    const next = nextPath || new URLSearchParams(window.location.search).get("next") || "";
    if (next.includes("approval") || next.includes("accounts")) {
      setEmail("accounts@liberty.local");
    }
  }, [nextPath]);

  return (
    <form action={action} className="mt-8 space-y-4 rounded-3xl border border-line bg-paper p-6">
      <input type="hidden" name="next" value={nextPath} />
      <div className="flex flex-wrap gap-2">
        {DEMO_ACCOUNTS.map((account) => (
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
          defaultValue="liberty"
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
