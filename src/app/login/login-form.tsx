"use client";

import { useActionState } from "react";
import { authenticate, type AuthState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, {});

  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input mt-1"
        />
      </label>

      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-accent" role="status">{state.message}</p>}

      <div className="flex gap-2 pt-2">
        <button name="intent" value="signin" disabled={pending} className="btn btn-primary flex-1">
          Sign in
        </button>
        <button name="intent" value="signup" disabled={pending} className="btn flex-1">
          Create account
        </button>
      </div>
    </form>
  );
}
