-- MawidPost migration 3: brands (clients), media library, Autopilot rules.
-- Run ONCE in Supabase SQL Editor, after migration-2-platform.sql.

-- ───────────────────────── Plans: brands + autopilot allowance ─────────────────────────
alter table plans add column if not exists max_brands int not null default 1;
alter table plans add column if not exists autopilot_posts int not null default 0; -- per month
update plans set max_brands = 1,  autopilot_posts = 8   where id = 'starter';
update plans set max_brands = 5,  autopilot_posts = 60  where id = 'growth';
update plans set max_brands = 20, autopilot_posts = 300 where id = 'scale';

-- ───────────────────────── Brands (an agency's clients) ─────────────────────────
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  industry text not null default '',
  description text not null default '',
  audience text not null default '',
  tone text not null default 'ودّي',
  language text not null default 'ar',
  avoid text not null default '',
  default_hashtags text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists brands_org_idx on brands (org_id);
alter table brands enable row level security;
drop policy if exists "org brands read" on brands;
drop policy if exists "org brands write" on brands;
create policy "org brands read" on brands for select using (is_member(org_id));
create policy "org brands write" on brands for all using (is_admin(org_id)) with check (is_admin(org_id));

create or replace function brands_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  if auth.uid() is null then return new; end if;
  select pl.max_brands into lim from organizations o join plans pl on pl.id = o.plan where o.id = new.org_id;
  select count(*) into n from brands where org_id = new.org_id;
  if n >= lim then raise exception 'plan_limit_brands'; end if;
  return new;
end $$;
drop trigger if exists brands_guard_trg on brands;
create trigger brands_guard_trg before insert on brands for each row execute function brands_guard();

alter table social_accounts add column if not exists brand_id uuid references brands(id) on delete set null;

-- Give every existing company a first brand and attach its existing accounts to it.
insert into brands (org_id, name)
select o.id, o.name from organizations o where not exists (select 1 from brands b where b.org_id = o.id);
update social_accounts a set brand_id = (select b.id from brands b where b.org_id = a.org_id order by b.created_at limit 1)
 where a.brand_id is null;

-- ───────────────────────── Media library ─────────────────────────
create table if not exists media_library (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  url text not null,
  kind text not null check (kind in ('image', 'video')),
  caption text not null default '',   -- caption written by the account manager (used exactly as is)
  note text not null default '',       -- optional facts for the AI when no caption is given
  used_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists media_library_brand_idx on media_library (brand_id, used_count, last_used_at);
alter table media_library enable row level security;
drop policy if exists "org media library" on media_library;
create policy "org media library" on media_library for all using (is_member(org_id)) with check (is_member(org_id));

-- ───────────────────────── Autopilot ─────────────────────────
alter table posts add column if not exists autopilot boolean not null default false;

create table if not exists autopilot_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  account_id uuid not null unique references social_accounts(id) on delete cascade,
  enabled boolean not null default false,
  days int[] not null default '{1,3,5}',            -- 0 = Sunday ... 6 = Saturday
  times text[] not null default '{19:00}',          -- HH:MM in tz
  tz text not null default 'Asia/Kuwait',
  post_type text not null default 'post' check (post_type in ('post', 'story', 'reel')),
  approval boolean not null default true,           -- true: wait for a person to approve; false: publish on its own
  text_only_ok boolean not null default false,      -- Facebook only: allow text posts when the library is empty
  last_run_at timestamptz,
  last_note text,
  created_at timestamptz not null default now()
);
alter table autopilot_rules enable row level security;
drop policy if exists "org autopilot read" on autopilot_rules;
drop policy if exists "org autopilot write" on autopilot_rules;
create policy "org autopilot read" on autopilot_rules for select using (is_member(org_id));
create policy "org autopilot write" on autopilot_rules for all using (is_admin(org_id)) with check (is_admin(org_id));

-- Two overlapping Autopilot runs can never create the same slot twice.
create unique index if not exists posts_autopilot_slot_uidx on posts (account_id, scheduled_at) where autopilot;

-- New companies get their first brand automatically.
create or replace function create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations (name) values (org_name) returning id into new_id;
  insert into members (org_id, user_id, role) values (new_id, auth.uid(), 'owner');
  insert into brands (org_id, name) values (new_id, org_name);
  return new_id;
end
$$;
