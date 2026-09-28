"use client";

import { SubmitButton } from "@/components/submit-button";

// A one-button form that asks for confirmation before running a server action.
export function ConfirmButton({
  action,
  confirmMessage,
  pendingText,
  className,
  children,
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  pendingText?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <SubmitButton pendingText={pendingText} className={className}>
        {children}
      </SubmitButton>
    </form>
  );
}
