// End-to-end check of auth, RLS and the invite-member edge function against
// the local Supabase stack, through the same APIs the app uses.
//
//   npx supabase start
//   npm run test:e2e

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
const API_URL = status.API_URL;
const KEY = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const MAIL_URL = status.MAILPIT_URL ?? status.INBUCKET_URL;

const run = Date.now();
const address = (name) => `${name}.${run}@example.com`;
const PASSWORD = "correct-horse-battery";

function newClient() {
  return createClient(API_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUp(name) {
  const client = newClient();
  const { data, error } = await client.auth.signUp({ email: address(name), password: PASSWORD });
  if (error) throw error;
  assert.ok(data.session, "expected a session straight away (email confirmation is off locally)");
  return { client, id: data.user.id, email: address(name) };
}

// Returns { status, body } for both success and error responses.
async function invite(client, listId, email) {
  const { data, error } = await client.functions.invoke("invite-member", { body: { list_id: listId, email } });
  if (!error) return { status: 201, body: data };
  const res = error.context;
  return { status: res?.status, body: await res?.json?.().catch(() => null) };
}

// The local stack catches outgoing email in Mailpit; wait for one to arrive.
async function waitForEmail(to) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages = [] } = await res.json();
    if (messages.length) {
      const msg = await fetch(`${MAIL_URL}/api/v1/message/${messages[0].ID}`).then((r) => r.json());
      return msg.HTML;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email for ${to}`);
}

let count = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`ok ${++count} - ${name}`);
  } catch (err) {
    console.log(`not ok ${++count} - ${name}`);
    throw err;
  }
}

const alice = await signUp("alice");
const bob = await signUp("bob");
const eve = await signUp("eve");

const { data: list, error: listError } = await alice.client.from("lists").insert({ title: "Road trip" }).select().single();
if (listError) throw listError;
await alice.client.from("items").insert({ list_id: list.id, content: "Snacks" });

await test("bob can't see alice's list before it is shared", async () => {
  const { data } = await bob.client.from("lists").select("id").eq("id", list.id);
  assert.equal(data.length, 0);
});

await test("the function rejects calls without a user JWT", async () => {
  const res = await fetch(`${API_URL}/functions/v1/invite-member`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ list_id: list.id, email: bob.email }),
  });
  assert.equal(res.status, 401);
});

await test("the function validates its input", async () => {
  const res = await invite(alice.client, "not-a-uuid", bob.email);
  assert.equal(res.status, 400);
  const res2 = await invite(alice.client, list.id, "nope");
  assert.equal(res2.status, 400);
});

await test("a stranger can't share alice's list (looks like it doesn't exist)", async () => {
  const res = await invite(eve.client, list.id, eve.email);
  assert.equal(res.status, 404);
});

await test("alice can share her list with bob", async () => {
  const res = await invite(alice.client, list.id, bob.email.toUpperCase());
  assert.equal(res.status, 201);
  assert.equal(res.body.member.user_id, bob.id);
  assert.equal(res.body.member.email, bob.email);
});

await test("sharing twice is a no-op", async () => {
  const res = await invite(alice.client, list.id, bob.email);
  assert.equal(res.status, 201);
  const { data } = await alice.client.from("list_members").select("user_id").eq("list_id", list.id);
  assert.equal(data.length, 1);
});

await test("bob now sees the list and its items", async () => {
  const { data } = await bob.client.from("lists").select("id, items(content)").eq("id", list.id).single();
  assert.deepEqual(data.items.map((i) => i.content), ["Snacks"]);
});

await test("bob, a member but not the owner, can't share it further", async () => {
  const res = await invite(bob.client, list.id, eve.email);
  assert.equal(res.status, 403);
});

await test("alice can't invite herself", async () => {
  const res = await invite(alice.client, list.id, alice.email);
  assert.equal(res.status, 400);
});

await test("bob can't insert a membership row directly, only through the function", async () => {
  const { error } = await bob.client
    .from("list_members")
    .insert({ list_id: list.id, user_id: eve.id, email: eve.email });
  assert.equal(error?.code, "42501");
});

await test("signed-in users can't call the email lookup RPC", async () => {
  const { error } = await eve.client.rpc("user_id_by_email", { p_email: alice.email });
  assert.equal(error?.code, "42501");
});

const carolEmail = address("carol");

await test("sharing with someone new creates their account and emails an invite", async () => {
  const res = await invite(alice.client, list.id, carolEmail);
  assert.equal(res.status, 201);
});

await test("the invite link signs carol in and she can see the list", async () => {
  const html = await waitForEmail(carolEmail);
  const href = html.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&");
  const url = new URL(href);
  assert.equal(url.pathname, "/auth/confirm");
  assert.equal(url.searchParams.get("type"), "invite");
  assert.equal(url.searchParams.get("next"), "/welcome");

  // This is what the app's /auth/confirm route does with the link.
  const carol = newClient();
  const { error } = await carol.auth.verifyOtp({ type: "invite", token_hash: url.searchParams.get("token_hash") });
  assert.ifError(error);

  const { data } = await carol.from("lists").select("title").eq("id", list.id).single();
  assert.equal(data.title, "Road trip");

  // ...and what /welcome does, after which she can sign in normally.
  const { error: pwError } = await carol.auth.updateUser({ password: PASSWORD });
  assert.ifError(pwError);
  const { error: signInError } = await newClient().auth.signInWithPassword({ email: carolEmail, password: PASSWORD });
  assert.ifError(signInError);
});

await test("bob can leave the list", async () => {
  const { error } = await bob.client.from("list_members").delete().eq("list_id", list.id).eq("user_id", bob.id);
  assert.ifError(error);
  const { data } = await bob.client.from("lists").select("id").eq("id", list.id);
  assert.equal(data.length, 0);
});

console.log(`\nall ${count} checks passed`);
