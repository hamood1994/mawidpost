-- MawidPost migration 2: plans, team & approvals, saved captions, hashtags, link-in-bio,
-- AI usage, Meta account tokens (server-only), analytics snapshots, publishing queue.
-- Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- (Run migration-media.sql first if you have not.)

-- ───────────────────────── Plans ─────────────────────────
create table if not exists plans (
  id text primary key,
  name text not null,
  sort int not null,
  max_accounts int not null,
  max_members int not null,
  max_posts_per_account int,           -- per calendar month; null = unlimited
  ai_credits int not null,             -- per calendar month
  approvals boolean not null default false
);
insert into plans (id, name, sort, max_accounts, max_members, max_posts_per_account, ai_credits, approvals) values
  ('starter', 'Starter', 1, 3, 1, 30, 5, false),
  ('growth',  'Growth',  2, 10, 3, 180, 50, true),
  ('scale',   'Scale',   3, 30, 10, null, 100, true)
on conflict (id) do update set
  name = excluded.name, sort = excluded.sort, max_accounts = excluded.max_accounts,
  max_members = excluded.max_members, max_posts_per_account = excluded.max_posts_per_account,
  ai_credits = excluded.ai_credits, approvals = excluded.approvals;
alter table plans enable row level security;
drop policy if exists "plans readable" on plans;
create policy "plans readable" on plans for select using (true);

alter table organizations add column if not exists plan text not null default 'starter' references plans(id);
-- Testing phase: put every existing company on the biggest plan.
update organizations set plan = 'scale';

-- ───────────────────────── Helpers ─────────────────────────
create or replace function member_role(o uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from members where org_id = o and user_id = auth.uid()
$$;

create or replace function is_admin(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where org_id = o and user_id = auth.uid() and role in ('owner', 'admin'))
$$;

-- ───────────────────────── Posts ─────────────────────────
alter table posts add column if not exists first_comment text;
alter table posts add column if not exists error text;
alter table posts add column if not exists external_id text;
alter table posts add column if not exists published_at timestamptz;
alter table posts add column if not exists attempts int not null default 0;
alter table posts add column if not exists claimed_at timestamptz;
alter table posts drop constraint if exists posts_status_check;
alter table posts add constraint posts_status_check
  check (status in ('draft', 'pending', 'scheduled', 'publishing', 'published', 'failed'));
create index if not exists posts_due_idx on posts (status, scheduled_at);

-- Editors can only submit for approval; plan limits are enforced here so they cannot be bypassed from the browser.
create or replace function posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text;
  lim int;
  n int;
begin
  if auth.uid() is null then
    return new; -- server (service role) updates: publishing queue etc.
  end if;

  select role into r from members where org_id = new.org_id and user_id = auth.uid();
  if r = 'editor' and new.status in ('scheduled', 'publishing', 'published', 'failed') then
    raise exception 'editors_must_submit_for_approval';
  end if;

  if new.account_id is not null and new.status in ('pending', 'scheduled', 'publishing', 'published')
     and (tg_op = 'INSERT' or old.status in ('draft', 'failed')
          or old.scheduled_at is distinct from new.scheduled_at
          or old.account_id is distinct from new.account_id) then
    select pl.max_posts_per_account into lim
      from organizations o join plans pl on pl.id = o.plan where o.id = new.org_id;
    if lim is not null then
      select count(*) into n from posts
       where account_id = new.account_id and id <> new.id
         and status in ('pending', 'scheduled', 'publishing', 'published')
         and date_trunc('month', scheduled_at) = date_trunc('month', new.scheduled_at);
      if n >= lim then
        raise exception 'plan_limit_posts';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists posts_guard_trg on posts;
create trigger posts_guard_trg before insert or update on posts
  for each row execute function posts_guard();

-- Publishing queue: atomically take due posts (safe with several workers).
create or replace function claim_due_posts(batch int default 5) returns setof posts
language plpgsql security definer set search_path = public as $$
begin
  update posts set status = 'failed', error = 'انتهت مهلة النشر', claimed_at = null
   where status = 'publishing' and claimed_at < now() - interval '20 minutes';

  return query
  update posts p set status = 'publishing', claimed_at = now()
   where p.id in (
     select id from posts
      where status = 'scheduled' and scheduled_at + (attempts * interval '3 minutes') <= now()
      order by scheduled_at
      limit batch
      for update skip locked)
  returning p.*;
end $$;
revoke execute on function claim_due_posts(int) from public, anon, authenticated;
grant execute on function claim_due_posts(int) to service_role;

-- ───────────────────────── Social accounts + tokens ─────────────────────────
alter table social_accounts add column if not exists avatar_url text;

-- Access tokens live here, encrypted by the server. RLS is enabled with NO policies,
-- so browsers (anon/authenticated) can never read them; only the server (service role) can.
create table if not exists account_tokens (
  account_id uuid primary key references social_accounts(id) on delete cascade,
  token_enc text not null,
  fb_user_id text,
  updated_at timestamptz not null default now()
);
alter table account_tokens enable row level security;

create table if not exists account_stats (
  account_id uuid not null references social_accounts(id) on delete cascade,
  day date not null,
  followers int,
  media_count int,
  primary key (account_id, day)
);
alter table account_stats enable row level security;
drop policy if exists "org account stats" on account_stats;
create policy "org account stats" on account_stats for select
  using (exists (select 1 from social_accounts a where a.id = account_id and is_member(a.org_id)));

-- Plan account limit for manual inserts from the browser too.
create or replace function accounts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  if auth.uid() is null then return new; end if;
  select pl.max_accounts into lim from organizations o join plans pl on pl.id = o.plan where o.id = new.org_id;
  select count(*) into n from social_accounts where org_id = new.org_id;
  if n >= lim then raise exception 'plan_limit_accounts'; end if;
  return new;
end $$;
drop trigger if exists accounts_guard_trg on social_accounts;
create trigger accounts_guard_trg before insert on social_accounts
  for each row execute function accounts_guard();

-- ───────────────────────── Library ─────────────────────────
create table if not exists saved_captions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create table if not exists hashtag_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  tags text not null,
  created_at timestamptz not null default now()
);
alter table saved_captions enable row level security;
alter table hashtag_groups enable row level security;
drop policy if exists "org captions" on saved_captions;
drop policy if exists "org hashtags" on hashtag_groups;
create policy "org captions" on saved_captions for all using (is_member(org_id)) with check (is_member(org_id));
create policy "org hashtags" on hashtag_groups for all using (is_member(org_id)) with check (is_member(org_id));

-- ───────────────────────── Team ─────────────────────────
create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table invites enable row level security;
drop policy if exists "admins manage invites" on invites;
create policy "admins manage invites" on invites for all using (is_admin(org_id)) with check (is_admin(org_id));

create or replace function accept_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype; lim int; n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into inv from invites where token = invite_token and accepted_at is null;
  if not found then raise exception 'invite_invalid'; end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'invite_email_mismatch'; end if;
  if not exists (select 1 from members where org_id = inv.org_id and user_id = auth.uid()) then
    select pl.max_members into lim from organizations o join plans pl on pl.id = o.plan where o.id = inv.org_id;
    select count(*) into n from members where org_id = inv.org_id;
    if n >= lim then raise exception 'plan_limit_members'; end if;
    insert into members (org_id, user_id, role) values (inv.org_id, auth.uid(), inv.role);
  end if;
  update invites set accepted_at = now() where id = inv.id;
  return inv.org_id;
end $$;

create or replace function org_members(o uuid) returns table (user_id uuid, email text, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role
    from members m join auth.users u on u.id = m.user_id
   where m.org_id = o and is_member(o)
   order by m.role, u.email
$$;

create or replace function remove_member(o uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if not is_admin(o) then raise exception 'forbidden'; end if;
  select role into r from members where org_id = o and user_id = uid;
  if r = 'owner' then raise exception 'cannot_remove_owner'; end if;
  delete from members where org_id = o and user_id = uid;
end $$;

create or replace function set_member_role(o uuid, uid uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if member_role(o) <> 'owner' then raise exception 'forbidden'; end if;
  if new_role not in ('admin', 'editor') then raise exception 'invalid_role'; end if;
  update members set role = new_role where org_id = o and user_id = uid and role <> 'owner';
end $$;

-- TEMPORARY (no billing yet): the owner can switch plan to try limits. Replace with real billing later.
create or replace function set_org_plan(o uuid, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if member_role(o) <> 'owner' then raise exception 'forbidden'; end if;
  update organizations set plan = p where id = o;
end $$;

-- ───────────────────────── Approvals / activity ─────────────────────────
create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  author uuid default auth.uid() references auth.users(id) on delete set null,
  author_email text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on post_comments (post_id, created_at);
alter table post_comments enable row level security;
drop policy if exists "org post comments" on post_comments;
create policy "org post comments" on post_comments for all using (is_member(org_id)) with check (is_member(org_id));

-- ───────────────────────── Link in bio (public read) ─────────────────────────
create table if not exists bio_pages (
  org_id uuid primary key references organizations(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  title text not null default '',
  bio text not null default '',
  avatar_url text,
  links jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table bio_pages enable row level security;
drop policy if exists "bio public read" on bio_pages;
drop policy if exists "bio admin insert" on bio_pages;
drop policy if exists "bio admin update" on bio_pages;
drop policy if exists "bio admin delete" on bio_pages;
create policy "bio public read" on bio_pages for select using (true);
create policy "bio admin insert" on bio_pages for insert with check (is_admin(org_id));
create policy "bio admin update" on bio_pages for update using (is_admin(org_id)) with check (is_admin(org_id));
create policy "bio admin delete" on bio_pages for delete using (is_admin(org_id));

-- ───────────────────────── AI usage ─────────────────────────
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_org_idx on ai_usage (org_id, created_at);
alter table ai_usage enable row level security;
drop policy if exists "org ai usage read" on ai_usage;
create policy "org ai usage read" on ai_usage for select using (is_member(org_id));
