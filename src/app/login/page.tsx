import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Tandem" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-sm pt-12">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to Tandem</h1>
      <p className="mt-2 text-sm text-muted">Checklists you can share with anyone.</p>
      <LoginForm />
    </div>
  );
}
