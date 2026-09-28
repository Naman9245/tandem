"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthMode = "signin" | "signup" | "reset";

// `suggest` lets the form offer the obvious next step, e.g. "create an
// account instead" after a failed sign-in.
export type AuthState = { error?: string; message?: string; suggest?: AuthMode };

const MIN_PASSWORD = 8;

export async function authenticate(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const mode = formData.get("mode") as AuthMode;
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();

  if (mode === "reset") {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error?.code?.startsWith("over_")) return { error: "Too many attempts. Wait a minute and try again." };
    // Same answer whether or not the account exists, so this form can't be
    // used to find out who has signed up.
    return { message: "If there's an account for that email, a reset link is on its way." };
  }

  if (!password) return { error: "Enter your password." };

  if (mode === "signup") {
    if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters for the password.` };

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (error.code === "user_already_exists") {
        return { error: "There's already an account with that email.", suggest: "signin" };
      }
      return { error: friendlyError(error.code, error.message) };
    }
    // With email confirmation on (the default on hosted Supabase) there's no
    // session until they click the link in their inbox.
    if (!data.session) return { message: "Check your inbox for a link to confirm your account." };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === "invalid_credentials") {
        return { error: "Wrong email or password.", suggest: "signup" };
      }
      return { error: friendlyError(error.code, error.message) };
    }
  }

  revalidatePath("/", "layout");
  redirect("/");
}

function friendlyError(code: string | undefined, fallback: string) {
  switch (code) {
    case "email_address_invalid":
    case "validation_failed":
      return "That email address doesn't look right.";
    case "weak_password":
      return `That password is too weak. Use at least ${MIN_PASSWORD} characters.`;
    case "email_not_confirmed":
      return "Confirm your email first. The link is in your inbox.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
    default:
      return fallback;
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
