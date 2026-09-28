import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose a password · Tandem" };

// Two kinds of people land here from an email link, already signed in:
// someone who was invited to a list (their account has no password yet), and
// someone who asked to reset a forgotten password.
export default async function SetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-sm pt-12">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a password</h1>
      <p className="mt-2 text-sm text-muted">
        You&apos;re signed in as {user.email}. Pick a password so you can sign in again later.
      </p>
      <SetPasswordForm />
    </div>
  );
}
