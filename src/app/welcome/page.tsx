import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

// Invited users land here from the invite email. Their account exists but has
// no password yet.
export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-sm pt-16">
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re in</h1>
      <p className="mt-2 text-sm text-muted">
        Someone shared a list with {user.email}. Pick a password so you can sign in again later.
      </p>
      <SetPasswordForm />
    </div>
  );
}
