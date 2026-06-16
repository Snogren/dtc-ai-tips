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

-- auto-create a profile when a user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
  example     text,
  author_id   uuid references profiles(id),
  created_at  timestamptz not null default now()
);

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

-- profiles: approved users can read all; you can edit only your own.
create policy profiles_read   on profiles for select using (is_approved());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- groups
create policy groups_read   on groups for select using (is_approved());
create policy groups_insert on groups for insert with check (is_approved() and author_id = auth.uid());
create policy groups_update on groups for update using (is_approved() and author_id = auth.uid())
                                              with check (is_approved() and author_id = auth.uid());
create policy groups_delete on groups for delete using (is_approved() and author_id = auth.uid());

-- tips
create policy tips_read   on tips for select using (is_approved());
create policy tips_insert on tips for insert with check (is_approved() and author_id = auth.uid());
create policy tips_update on tips for update using (is_approved() and author_id = auth.uid())
                                          with check (is_approved() and author_id = auth.uid());
create policy tips_delete on tips for delete using (is_approved() and author_id = auth.uid());

-- ratings (one per user per tip; edit only your own)
create policy ratings_read   on ratings for select using (is_approved());
create policy ratings_insert on ratings for insert with check (is_approved() and user_id = auth.uid());
create policy ratings_update on ratings for update using (is_approved() and user_id = auth.uid())
                                              with check (is_approved() and user_id = auth.uid());
create policy ratings_delete on ratings for delete using (is_approved() and user_id = auth.uid());
