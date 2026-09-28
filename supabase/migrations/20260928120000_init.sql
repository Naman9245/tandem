-- Tandem: shared checklists.
--
--   lists         a checklist, owned by exactly one user
--   list_members  who else a list is shared with (the owner is NOT a row here)
--   items         the entries on a list
--
-- Access rules (enforced by RLS below, tested in supabase/tests):
--   * You can see a list if you own it or are a member of it.
--   * Only the owner can rename or delete a list, and remove members.
--   * Anyone with access can add items and tick them off.
--   * An item can be deleted by whoever wrote it, or by the list owner.
--   * Members are added only by the invite-member edge function; clients have
--     no INSERT privilege on list_members at all.

-- Helper functions live in a schema PostgREST does not expose, so they can be
-- used inside policies but can't be called over the API.
create schema if not exists private;
grant usage on schema private to authenticated;

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index lists_owner_id_idx on public.lists (owner_id);

create table public.list_members (
  list_id  uuid not null references public.lists (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  -- Copied from auth.users at invite time so members can see who else is on
  -- the list without anyone reading auth.users.
  email    text not null,
  added_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index list_members_user_id_idx on public.list_members (user_id);

create table public.items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists (id) on delete cascade,
  content    text not null check (char_length(btrim(content)) between 1 and 280),
  done       boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index items_list_id_idx on public.items (list_id);
create index items_created_by_idx on public.items (created_by);

-------------------------------------------------------------------------------
-- Policy helpers
--
-- SECURITY DEFINER so they read lists/list_members without going back through
-- RLS. Without that, the lists policy would query list_members, whose policy
-- queries lists, and Postgres would fail with "infinite recursion detected".
-------------------------------------------------------------------------------

create function private.is_list_owner(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lists
    where id = p_list_id and owner_id = (select auth.uid())
  );
$$;

create function private.is_list_member(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.list_members
    where list_id = p_list_id and user_id = (select auth.uid())
  );
$$;

create function private.can_access_list(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_list_owner(p_list_id) or private.is_list_member(p_list_id);
$$;

revoke all on function private.is_list_owner(uuid)   from public;
revoke all on function private.is_list_member(uuid)  from public;
revoke all on function private.can_access_list(uuid) from public;
grant execute on function private.is_list_owner(uuid)   to authenticated;
grant execute on function private.is_list_member(uuid)  to authenticated;
grant execute on function private.can_access_list(uuid) to authenticated;

-------------------------------------------------------------------------------
-- Table privileges
--
-- Supabase grants ALL on new public tables to anon and authenticated. Start
-- from nothing and grant back only what the app uses. Column lists mean a
-- client can never write owner_id / created_by / list_id itself, whatever the
-- policies say.
-------------------------------------------------------------------------------

revoke all on public.lists, public.list_members, public.items from anon, authenticated;

grant select, delete        on public.lists to authenticated;
grant insert (title)        on public.lists to authenticated;
grant update (title)        on public.lists to authenticated;

grant select, delete        on public.list_members to authenticated;

grant select, delete        on public.items to authenticated;
grant insert (list_id, content) on public.items to authenticated;
grant update (content, done)    on public.items to authenticated;

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------

alter table public.lists        enable row level security;
alter table public.list_members enable row level security;
alter table public.items        enable row level security;

-- lists ----------------------------------------------------------------------

create policy "owners and members can read a list"
  on public.lists for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_list_member(id));

create policy "users can create lists they own"
  on public.lists for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "owners can rename their lists"
  on public.lists for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owners can delete their lists"
  on public.lists for delete to authenticated
  using (owner_id = (select auth.uid()));

-- list_members ---------------------------------------------------------------
-- No insert/update policies: only the service role (edge function) adds rows.

create policy "people on a list can see who else is on it"
  on public.list_members for select to authenticated
  using (private.can_access_list(list_id));

create policy "owners can remove members, members can leave"
  on public.list_members for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_list_owner(list_id));

-- items ----------------------------------------------------------------------

create policy "people on a list can read its items"
  on public.items for select to authenticated
  using (private.can_access_list(list_id));

create policy "people on a list can add items"
  on public.items for insert to authenticated
  with check (
    private.can_access_list(list_id)
    and created_by = (select auth.uid())
  );

create policy "people on a list can edit and tick items"
  on public.items for update to authenticated
  using (private.can_access_list(list_id))
  with check (private.can_access_list(list_id));

create policy "authors and list owners can delete items"
  on public.items for delete to authenticated
  using (
    private.can_access_list(list_id)
    and (created_by = (select auth.uid()) or private.is_list_owner(list_id))
  );

-------------------------------------------------------------------------------
-- Used by the invite-member edge function to turn an email into a user id.
-- auth.users is not exposed over the API, and this function is callable by the
-- service role only; signed-in users get "permission denied".
-------------------------------------------------------------------------------

create function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;

revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
