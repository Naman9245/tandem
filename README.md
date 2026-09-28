# Tandem

[![CI](https://github.com/Naman9245/tandem/actions/workflows/ci.yml/badge.svg)](https://github.com/Naman9245/tandem/actions/workflows/ci.yml)

Shared checklists on **Next.js 16** and **Supabase**. Sign up, make a list, share it with someone by email, and tick things off together.

The app is small on purpose. The interesting part is that **Postgres decides who can see what**. The Next.js code never checks permissions. Every query runs as the signed-in user, and row-level security policies filter or reject it. One edge function does the one job a browser can't be trusted with: sharing a list by email.

- **Auth:** Supabase Auth with email and password. Sessions live in cookies via `@supabase/ssr`, and a Next.js proxy refreshes them on each request.
- **3 tables:** `lists`, `list_members`, `items`.
- **Row-level security** on all three, plus column-level grants.
- **1 edge function:** `invite-member` looks up (or invites) a user by email and adds them to a list.
- **Tests:** 25 pgTAP tests for the policies and a 14-step end-to-end script for auth and the edge function. Both run in CI against a real local Supabase stack.

## Access rules

| | Owner | Member | Anyone else |
|---|:-:|:-:|:-:|
| See the list, its items and its members | ✓ | ✓ | ✗ (a 404, not a 403) |
| Add items, tick them off, edit them | ✓ | ✓ | ✗ |
| Delete an item | any item | only their own | ✗ |
| Rename or delete the list | ✓ | ✗ | ✗ |
| Share the list (edge function) | ✓ | ✗ | ✗ |
| Remove a member | ✓ | only themselves (leave) | ✗ |

All of this lives in [`supabase/migrations/20260928120000_init.sql`](supabase/migrations/20260928120000_init.sql). Details worth pointing out:

- **No recursive policies.** "Can I see this list?" depends on `list_members`, and "can I see this membership?" depends on `lists`. Written naively, the two policies query each other and Postgres fails with `infinite recursion detected`. The checks live in `SECURITY DEFINER` helpers (`private.is_list_owner`, `private.is_list_member`) that read the tables directly. They sit in a `private` schema that PostgREST doesn't expose, so policies can call them but the API can't.
- **Column-level grants.** Supabase grants `ALL` on new tables to `anon` and `authenticated`. The migration revokes that and grants back only what the app uses. For example, `INSERT (list_id, content)` on `items` means a client can't set `created_by` at all, and `UPDATE (content, done)` means an item can't be moved to another list. `anon` gets nothing.
- **Clients can't insert into `list_members`.** There is no insert grant or policy for signed-in users. Membership rows are written only by the edge function, after it has checked ownership.

## The edge function

[`supabase/functions/invite-member`](supabase/functions/invite-member/index.ts) takes `POST { list_id, email }` from a signed-in user:

1. `verify_jwt = true`, so the platform rejects requests without a valid user JWT before the code runs.
2. The function creates a client **with the caller's JWT** and reads the list through RLS. A list the caller can't see is a 404; a list they can see but don't own is a 403.
3. Only then does it switch to the **secret key**. It resolves the email to a user id through `public.user_id_by_email`, which only `service_role` may execute. Signed-in users get `permission denied`, so the API can't be used to probe for accounts.
4. If nobody has that email yet, it calls `auth.admin.inviteUserByEmail`. That creates the account and sends an invite link, and the membership row is written straight away. When the invitee clicks the link they land on `/welcome`, choose a password, and the list is already waiting under "Shared with you".

A plain SQL function couldn't do step 4: inviting a new user needs the Auth admin API, which is why this is an edge function.

## Run it locally

You need Node 20+ and Docker (the Supabase CLI runs the whole stack in containers).

```bash
npm install
npx supabase start          # first run pulls the images, takes a few minutes
cp .env.example .env.local  # already has the CLI's local URL and publishable key
npm run dev
```

Open http://localhost:3000 and create an account. Email confirmation is off locally, so you're signed in straight away. To try sharing, share a list with an email that doesn't have an account yet, then open the invite in Mailpit at http://127.0.0.1:54324. Supabase Studio is at http://127.0.0.1:54323.

## Tests

```bash
npm run test:db    # 25 pgTAP tests: RLS and grants, as anon / owner / member / stranger
npm run test:e2e   # 14 checks through supabase-js: auth, the edge function, the invite email flow
```

`test:db` runs [`supabase/tests/rls.test.sql`](supabase/tests/rls.test.sql) inside a transaction that is rolled back. It switches between users by setting `role` and `request.jwt.claims`, the same way PostgREST does. As a sanity check, turning RLS off on `items` makes four of the tests fail.

`test:e2e` ([`scripts/e2e.mjs`](scripts/e2e.mjs)) signs up throwaway users against the local stack and drives the real edge function. It also follows the invite email out of Mailpit: it verifies the token the way `/auth/confirm` does, then checks that the invitee can see the list.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint and the production build, starts Supabase, and runs both suites.

## Deploying to hosted Supabase

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npx supabase functions deploy invite-member
```

Then, in the dashboard:

- **Authentication → URL Configuration:** set the Site URL to where the app is hosted.
- **Authentication → Email Templates:** paste in [`supabase/templates/invite.html`](supabase/templates/invite.html) and [`confirmation.html`](supabase/templates/confirmation.html). The defaults put the session tokens in a URL fragment, which a server-rendered app never sees. These templates link to `/auth/confirm?token_hash=…` instead.
- Hosted Supabase sends only a few emails an hour with its built-in SMTP. Configure your own SMTP before relying on invites.

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` wherever the Next.js app runs (e.g. Vercel). The app needs no secret key. Only the edge function has one, and Supabase provides it automatically.

## Layout

```
src/
  proxy.ts                    session refresh + redirect to /login
  lib/supabase/               server client, proxy helper, generated DB types
  app/login/                  sign in / sign up (server actions)
  app/page.tsx                your lists and lists shared with you
  app/lists/[id]/             one list: items, people, share form
  app/lists/actions.ts        all list mutations; the share action calls the edge function
  app/auth/confirm/route.ts   exchanges email-link tokens for a session
  app/welcome/                invited users set a password
supabase/
  migrations/                 schema, grants, RLS policies
  functions/invite-member/    the edge function
  templates/                  invite + confirmation emails
  tests/rls.test.sql          pgTAP tests
scripts/e2e.mjs               end-to-end checks
```

## Known limitations

- Members see "The owner" rather than the owner's email. Showing it would need a `profiles` table readable by co-members, which felt like more schema than this demo needed.
- No realtime: you see other people's changes on your next page load. Supabase Realtime on `items` would be the natural next step, since it already respects RLS.
- A list can be shared with at most 20 people (checked in the edge function). There's no per-user limit on invites beyond Supabase's own email rate limits.
