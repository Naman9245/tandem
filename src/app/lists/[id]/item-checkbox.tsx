"use client";

import { useFormStatus } from "react-dom";

// Goes inside a form whose action flips the item. While that runs, show the
// new state straight away instead of waiting for the server.
export function ItemCheckbox({ done, label }: { done: boolean; label: string }) {
  const { pending } = useFormStatus();
  const shown = pending ? !done : done;

  return (
    <button
      disabled={pending}
      aria-label={done ? `Mark "${label}" as not done` : `Mark "${label}" as done`}
      className={`flex size-5 items-center justify-center rounded border text-xs ${
        shown ? "border-accent bg-accent text-accent-foreground" : "border-muted hover:border-accent"
      }`}
    >
      {shown && "✓"}
    </button>
  );
}
