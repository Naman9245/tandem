import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Target of the links in supabase/templates/*.html. Exchanges the one-time
// token_hash for a session cookie, then sends the user on to `next`.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Only follow `next` if it stays on this site. Comparing origins also catches
  // tricks like "//evil.com" and "/\evil.com" that a prefix check would miss.
  let next = new URL(searchParams.get("next") ?? "/", request.url);
  if (next.origin !== request.nextUrl.origin) next = new URL("/", request.url);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(next);
  }

  return NextResponse.redirect(new URL("/auth/error", request.url));
}
