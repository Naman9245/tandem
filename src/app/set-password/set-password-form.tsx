"use client";

import { useActionState } from "react";
import { setPassword } from "./actions";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, {});

  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block">
        <span className="flex items-baseline justify-between text-sm">
          <span className="font-medium">New password</span>
          <span className="text-muted">at least 8 characters</span>
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input mt-1"
        />
      </label>
      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
