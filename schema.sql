-- ============================================================
--  AI Tips — Postgres schema + RLS  (run in Supabase SQL editor)
--  Private site: access limited to approved DTC users.
-- ============================================================

-- ---------- profiles (one row per auth user) ----------
create table if not exists profiles (
  id            uuid primary key references auth.users on delete cascade,
  email         text,
  display_name  text,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- auto-create a profile when a user signs up.
-- Also the signup gate: reject any email whose domain isn't approved. Raising
-- here rolls back the auth.users insert, so the account is never created. The
-- client only sees a generic "Database error saving new user" — it never
-- learns which domains are allowed.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if split_part(new.email, '@', 2) not in (select domain from approved_domains)
     and new.email not in (select email from approved_emails) then
    raise exception 'signup not permitted';
  end if;
  insert into profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- allowlists (admin-managed) ----------
create table if not exists approved_domains ( domain text primary key );
create table if not exists approved_emails  ( email  text primary key );

-- seed the known orgs (edit as needed)
insert into approved_domains (domain) values
  ('sprezzmc.com'), ('va.gov')
  on conflict do nothing;

-- ---------- the access gate ----------
create or replace function is_approved()
returns boolean language sql security definer stable set search_path = public as $$
  select split_part(auth.jwt() ->> 'email', '@', 2)
           in (select domain from approved_domains)
      or (auth.jwt() ->> 'email') in (select email from approved_emails);
$$;

-- ---------- content ----------
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  position    int  not null default 0,
  author_id   uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table if not exists tips (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references groups(id) on delete cascade,
  title       text not null,
  body        text not null,
  example     text,                                       -- legacy single example (kept for old rows)
  examples    jsonb not null default '[]'::jsonb,         -- one or more example prompts
  author_id   uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- add the multi-example column to databases created before it existed
alter table tips add column if not exists examples jsonb not null default '[]'::jsonb;

create table if not exists ratings (
  id          uuid primary key default gen_random_uuid(),
  tip_id      uuid references tips(id) on delete cascade,
  user_id     uuid references profiles(id),
  rating      int  not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tip_id, user_id)
);

create index if not exists ratings_tip_idx on ratings(tip_id);
create index if not exists tips_group_idx  on tips(group_id);

-- ============================================================
--  Row-Level Security
-- ============================================================
alter table profiles         enable row level security;
alter table approved_domains enable row level security;
alter table approved_emails  enable row level security;
alter table groups           enable row level security;
alter table tips             enable row level security;
alter table ratings          enable row level security;

-- allowlists: no client access (is_approved bypasses RLS as definer).
-- Manage them in the dashboard, or add admin policies if desired.

-- Policies are dropped-then-created so the whole file stays re-runnable.

-- profiles: approved users can read all; you can edit only your own.
drop policy if exists profiles_read   on profiles;
drop policy if exists profiles_update on profiles;
create policy profiles_read   on profiles for select using (is_approved());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- groups
drop policy if exists groups_read   on groups;
drop policy if exists groups_insert on groups;
drop policy if exists groups_update on groups;
drop policy if exists groups_delete on groups;
create policy groups_read   on groups for select using (is_approved());
create policy groups_insert on groups for insert with check (is_approved() and author_id = auth.uid());
create policy groups_update on groups for update using (is_approved() and author_id = auth.uid())
                                              with check (is_approved() and author_id = auth.uid());
create policy groups_delete on groups for delete using (is_approved() and author_id = auth.uid());

-- tips
drop policy if exists tips_read   on tips;
drop policy if exists tips_insert on tips;
drop policy if exists tips_update on tips;
drop policy if exists tips_delete on tips;
create policy tips_read   on tips for select using (is_approved());
create policy tips_insert on tips for insert with check (is_approved() and author_id = auth.uid());
create policy tips_update on tips for update using (is_approved() and author_id = auth.uid())
                                          with check (is_approved() and author_id = auth.uid());
create policy tips_delete on tips for delete using (is_approved() and author_id = auth.uid());

-- ratings (one per user per tip; edit only your own)
drop policy if exists ratings_read   on ratings;
drop policy if exists ratings_insert on ratings;
drop policy if exists ratings_update on ratings;
drop policy if exists ratings_delete on ratings;
create policy ratings_read   on ratings for select using (is_approved());
create policy ratings_insert on ratings for insert with check (is_approved() and user_id = auth.uid());
create policy ratings_update on ratings for update using (is_approved() and user_id = auth.uid())
                                              with check (is_approved() and user_id = auth.uid());
create policy ratings_delete on ratings for delete using (is_approved() and user_id = auth.uid());

-- ============================================================
--  Feedback channel — private member↔admin threads
--  A submission and its messages are visible only to the
--  author and to admins. Enforced here in RLS, never the client.
-- ============================================================

-- is the signed-in user an admin? security definer so policies on other
-- tables can call it without recursing through profiles' own RLS.
create or replace function is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create table if not exists submissions (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references profiles(id) on delete cascade,
  type        text not null check (type in ('idea','advice','complaint')),
  subject     text not null,
  status      text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists submission_messages (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  author_id     uuid not null references profiles(id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now()
);

-- per-user read marker, so the sidebar can flag unseen activity.
create table if not exists submission_reads (
  submission_id uuid not null references submissions(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (submission_id, user_id)
);

create index if not exists sub_messages_sub_idx on submission_messages(submission_id);
create index if not exists submissions_author_idx on submissions(author_id);

-- bump a submission's updated_at whenever a new message lands.
create or replace function touch_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update submissions set updated_at = now() where id = new.submission_id;
  return new;
end; $$;

drop trigger if exists on_submission_message on submission_messages;
create trigger on_submission_message
  after insert on submission_messages
  for each row execute function touch_submission();

-- can the signed-in user see this submission? (author or admin)
-- security definer to bypass submissions' RLS when called from message policies.
create or replace function can_see_submission(sid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from submissions s
    where s.id = sid and (s.author_id = auth.uid() or is_admin())
  );
$$;

alter table submissions         enable row level security;
alter table submission_messages enable row level security;
alter table submission_reads    enable row level security;

-- submissions: author sees own, admins see all; author creates own;
-- only admins change status (the update path).
drop policy if exists submissions_read   on submissions;
drop policy if exists submissions_insert on submissions;
drop policy if exists submissions_update on submissions;
create policy submissions_read   on submissions for select
  using (is_approved() and (author_id = auth.uid() or is_admin()));
create policy submissions_insert on submissions for insert
  with check (is_approved() and author_id = auth.uid());
create policy submissions_update on submissions for update
  using (is_approved() and is_admin()) with check (is_approved() and is_admin());

-- messages: visible to anyone who can see the parent submission; a reply's
-- author is always the poster, and they must be a party to the thread.
drop policy if exists messages_read   on submission_messages;
drop policy if exists messages_insert on submission_messages;
create policy messages_read   on submission_messages for select
  using (is_approved() and can_see_submission(submission_id));
create policy messages_insert on submission_messages for insert
  with check (is_approved() and author_id = auth.uid() and can_see_submission(submission_id));

-- reads: each user manages only their own markers.
drop policy if exists reads_all on submission_reads;
create policy reads_all on submission_reads for all
  using (is_approved() and user_id = auth.uid())
  with check (is_approved() and user_id = auth.uid());
