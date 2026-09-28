// invite-member: share a list with someone by email.
//
// POST { list_id, email }  (Authorization: Bearer <user JWT>)
//
// Clients can't do this themselves: turning an email into a user id means
// reading auth.users, inviting a brand-new user needs the Auth admin API, and
// list_members has no INSERT grant for signed-in users. So the function
//   1. identifies the caller from their JWT,
//   2. checks, under the caller's own RLS, that they own the list,
//   3. and only then uses the secret key to look up / invite the person and
//      write the membership row.

import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_MEMBERS = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Hosted projects expose the new sb_publishable_/sb_secret_ keys as JSON maps;
// fall back to the legacy anon/service_role variables where those don't exist.
function apiKey(kind: "publishable" | "secret"): string {
  const map = Deno.env.get(kind === "publishable" ? "SUPABASE_PUBLISHABLE_KEYS" : "SUPABASE_SECRET_KEYS");
  if (map) {
    const key = JSON.parse(map).default;
    if (key) return key;
  }
  const legacy = Deno.env.get(kind === "publishable" ? "SUPABASE_ANON_KEY" : "SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error(`No ${kind} key in the function environment`);
  return legacy;
}

const noSession = { persistSession: false, autoRefreshToken: false };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { list_id?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const listId = typeof body.list_id === "string" ? body.list_id : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!UUID_RE.test(listId)) return json({ error: "list_id must be a UUID" }, 400);
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "Enter a valid email address" }, 400);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;

    // Everything done through `asCaller` runs as the signed-in user, under RLS.
    const asCaller = createClient(url, apiKey("publishable"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: noSession,
    });

    const { data: { user } } = await asCaller.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    // RLS hides lists the caller can't see, so "doesn't exist" and "not
    // yours to see" look the same from here: both are a 404.
    const { data: list, error: listError } = await asCaller
      .from("lists")
      .select("id, owner_id")
      .eq("id", listId)
      .maybeSingle();
    if (listError) throw listError;
    if (!list) return json({ error: "List not found" }, 404);
    if (list.owner_id !== user.id) return json({ error: "Only the list owner can share it" }, 403);

    const { count, error: countError } = await asCaller
      .from("list_members")
      .select("user_id", { count: "exact", head: true })
      .eq("list_id", listId);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_MEMBERS) {
      return json({ error: `A list can be shared with at most ${MAX_MEMBERS} people` }, 409);
    }

    // From here on the secret key is used, which bypasses RLS. The checks
    // above are what make that safe.
    const admin = createClient(url, apiKey("secret"), { auth: noSession });

    const { data: existingId, error: lookupError } = await admin.rpc("user_id_by_email", { p_email: email });
    if (lookupError) throw lookupError;
    let userId = existingId as string | null;

    if (userId === user.id) return json({ error: "That's you, you already own this list" }, 400);

    if (!userId) {
      // No account yet. This creates one and emails them a link to set a
      // password (see supabase/templates/invite.html).
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error) {
        console.error("inviteUserByEmail failed", error);
        return json({ error: "Couldn't send the invite email, try again later" }, 502);
      }
      userId = data.user.id;
    }

    const { error: insertError } = await admin
      .from("list_members")
      .upsert({ list_id: listId, user_id: userId, email }, { onConflict: "list_id,user_id", ignoreDuplicates: true });
    if (insertError) throw insertError;

    // Same response whether or not the person already had an account, so the
    // endpoint can't be used to find out who is registered.
    return json({ member: { user_id: userId, email } }, 201);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong" }, 500);
  }
});
