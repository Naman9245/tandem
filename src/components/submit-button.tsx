"use client";

import { useFormStatus } from "react-dom";

// A submit button that disables itself while its form's server action runs,
// so slow requests don't look frozen and can't be double-submitted.
export function SubmitButton({
  pendingText,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();

  return (
    <button {...props} disabled={pending || props.disabled} aria-busy={pending}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
