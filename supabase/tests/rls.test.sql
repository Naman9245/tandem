-- RLS tests. Run with `npx supabase test db`.
--
-- Cast: alice owns a list, bob is a member of it, eve is a stranger.
-- Everything runs in one transaction that is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com');

insert into public.lists (id, owner_id, title) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Groceries');

insert into public.list_members (list_id, user_id, email) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'bob@example.com');

insert into public.items (id, list_id, content, created_by) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Milk',
   '00000000-0000-0000-0000-00000000000a');

-------------------------------------------------------------------------------
-- anon: no access at all
-------------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select * from public.lists $$,
  '42501', 'permission denied for table lists',
  'anon cannot read lists'
);

-------------------------------------------------------------------------------
-- eve: signed in, but the list isn't shared with her
-------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}';

select is((select count(*) from public.lists), 0::bigint, 'eve cannot see alice''s list');
select is((select count(*) from public.items), 0::bigint, 'eve cannot see its items');
select is((select count(*) from public.list_members), 0::bigint, 'eve cannot see who it is shared with');

select throws_ok(
  $$ insert into public.items (list_id, content) values ('10000000-0000-0000-0000-000000000001', 'Spam') $$,
  '42501', 'new row violates row-level security policy for table "items"',
  'eve cannot add items to alice''s list'
);

select results_eq(
  $$ with d as (delete from public.list_members where list_id = '10000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'eve cannot remove members from alice''s list'
);

select throws_ok(
  $$ insert into public.lists (title, owner_id) values ('Mine now', '00000000-0000-0000-0000-00000000000a') $$,
  '42501', 'permission denied for table lists',
  'eve cannot create a list owned by someone else'
);

select throws_ok(
  $$ insert into public.list_members (list_id, user_id, email)
     values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e', 'eve@example.com') $$,
  '42501', 'permission denied for table list_members',
  'eve cannot add herself as a member'
);

select throws_ok(
  $$ select public.user_id_by_email('alice@example.com') $$,
  '42501', 'permission denied for function user_id_by_email',
  'signed-in users cannot look up user ids by email'
);

-------------------------------------------------------------------------------
-- bob: member of alice's list
-------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*) from public.lists), 1::bigint, 'bob can see the list shared with him');
select is((select count(*) from public.items), 1::bigint, 'bob can see its items');

select lives_ok(
  $$ insert into public.items (list_id, content) values ('10000000-0000-0000-0000-000000000001', 'Eggs') $$,
  'bob can add an item'
);

select is(
  (select created_by from public.items where content = 'Eggs'),
  '00000000-0000-0000-0000-00000000000b'::uuid,
  'created_by is filled in from the JWT'
);

select results_eq(
  $$ with u as (update public.items set done = true where id = '20000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'bob can tick off alice''s item'
);

select results_eq(
  $$ with d as (delete from public.items where id = '20000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'bob cannot delete alice''s item'
);

select throws_ok(
  $$ update public.items set created_by = '00000000-0000-0000-0000-00000000000b'
     where id = '20000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table items',
  'bob cannot rewrite who created an item'
);

select results_eq(
  $$ with u as (update public.lists set title = 'Bob''s now' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'bob cannot rename the list'
);

select results_eq(
  $$ with d as (delete from public.lists returning 1) select count(*)::int from d $$,
  $$ values (0) $$,
  'bob cannot delete the list'
);

-------------------------------------------------------------------------------
-- alice: owner
-------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*) from public.list_members), 1::bigint, 'alice can see who her list is shared with');

select results_eq(
  $$ with d as (delete from public.items where content = 'Eggs' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'alice can delete bob''s item on her list'
);

select results_eq(
  $$ with u as (update public.lists set title = 'Weekly shop' returning 1) select count(*)::int from u $$,
  $$ values (1) $$,
  'alice can rename her list'
);

-------------------------------------------------------------------------------
-- bob leaves
-------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from public.list_members where user_id = '00000000-0000-0000-0000-00000000000b' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'bob can leave the list'
);
select is((select count(*) from public.lists), 0::bigint, 'after leaving, bob can no longer see it');

-------------------------------------------------------------------------------
-- alice deletes the list; items go with it
-------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from public.lists where id = '10000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'alice can delete her list'
);

reset role;
select is(
  (select count(*) from public.items where list_id = '10000000-0000-0000-0000-000000000001'),
  0::bigint,
  'deleting a list deletes its items'
);

select * from finish();
rollback;
