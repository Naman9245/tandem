"use client";

import { useActionState, useState } from "react";
import type { InviteState } from "../actions";

export function InviteForm({
  action,
}: {
  action: (prev: InviteState, formData: FormData) => Promise<InviteState>;
}) {
  // React resets the form after every submit. Feeding the typed address back
  // in as the default keeps it after an error; clearing it on success empties
  // the field for the next person.
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(async (prev: InviteState, formData: FormData) => {
    const result = await action(prev, formData);
    if (!result.error) setEmail("");
    return result;
  }, {});

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="friend@example.com"
          aria-label="Email to share with"
          defaultValue={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />
        <button disabled={pending} className="btn shrink-0">
          {pending ? "Sharing…" : "Share"}
        </button>
      </div>
      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="text-sm text-accent" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
