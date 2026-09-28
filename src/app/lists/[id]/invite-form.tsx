"use client";

import { useActionState } from "react";
import type { InviteState } from "../actions";

export function InviteForm({
  action,
}: {
  action: (prev: InviteState, formData: FormData) => Promise<InviteState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="friend@example.com"
          aria-label="Email to share with"
          className="input"
        />
        <button disabled={pending} className="btn shrink-0">
          {pending ? "Sharing…" : "Share"}
        </button>
      </div>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-accent" role="status">{state.message}</p>}
    </form>
  );
}
