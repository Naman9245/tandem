"use client";

import { useActionState, useState } from "react";
import { authenticate, type AuthMode, type AuthState } from "./actions";

const COPY: Record<AuthMode, { submit: string; pending: string }> = {
  signin: { submit: "Sign in", pending: "Signing in…" },
  signup: { submit: "Create account", pending: "Creating account…" },
  reset: { submit: "Send reset link", pending: "Sending…" },
};

export function LoginForm() {
  const [mode, setMode] = useState<AuthMode>("signin");
  // Kept up here so the address survives switching tabs and failed attempts.
  const [email, setEmail] = useState("");

  return (
    <div className="mt-8">
      {mode !== "reset" && (
        <div role="tablist" className="grid grid-cols-2 rounded-md border border-border bg-surface p-1 text-sm">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1.5 font-medium ${
                mode === m ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {COPY[m].submit}
            </button>
          ))}
        </div>
      )}
      {/* key={mode} gives each tab a fresh form state, so an error from one
          tab doesn't linger on the other. */}
      <AuthForm key={mode} mode={mode} email={email} onEmailChange={setEmail} onSwitch={setMode} />
    </div>
  );
}

function AuthForm({
  mode,
  email,
  onEmailChange,
  onSwitch,
}: {
  mode: AuthMode;
  email: string;
  onEmailChange: (email: string) => void;
  onSwitch: (mode: AuthMode) => void;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="mode" value={mode} />

      {mode === "reset" && (
        <p className="text-sm text-muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      )}

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className="input mt-1"
        />
      </label>

      {mode !== "reset" && (
        <label className="block">
          <span className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Password</span>
            {mode === "signup" && <span className="text-muted">at least 8 characters</span>}
            {mode === "signin" && (
              <button type="button" onClick={() => onSwitch("reset")} className="text-muted hover:text-foreground">
                Forgot password?
              </button>
            )}
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="input mt-1"
          />
        </label>
      )}

      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}{" "}
          {state.suggest === "signup" && (
            <button type="button" onClick={() => onSwitch("signup")} className="font-medium underline">
              New here? Create an account
            </button>
          )}
          {state.suggest === "signin" && (
            <button type="button" onClick={() => onSwitch("signin")} className="font-medium underline">
              Sign in instead
            </button>
          )}
        </p>
      )}
      {state.message && (
        <p className="text-sm text-accent" role="status">
          {state.message}
        </p>
      )}

      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? COPY[mode].pending : COPY[mode].submit}
      </button>

      {mode === "reset" && (
        <button type="button" onClick={() => onSwitch("signin")} className="w-full text-sm text-muted hover:text-foreground">
          ← Back to sign in
        </button>
      )}
    </form>
  );
}
