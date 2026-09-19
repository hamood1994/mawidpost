-- MawidPost database schema. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Every company (organization) only ever sees its own rows, enforced by row-level security.

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'editor')),
  primary key (org_id, user_id)
);

-- NOTE: real access tokens from Instagram/Facebook/TikTok must NOT be stored in this table.
-- They go in a separate server-only table added in the Meta connection step.
create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok')),
  handle text not null,
  external_id text,
  status text not null default 'connected',
  created_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  account_id uuid references social_accounts(id) on delete set null,
  caption text not null default '',
  media_url text,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('draft', 'scheduled', 'published', 'failed')),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index posts_org_time_idx on posts (org_id, scheduled_at);
create index social_accounts_org_idx on social_accounts (org_id);

-- Is the signed-in user a member of this organization?
create function is_member(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where org_id = o and user_id = auth.uid())
$$;

-- Creates a company and makes the caller its owner (used right after first sign up).
create function create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations (name) values (org_name) returning id into new_id;
  insert into members (org_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end
$$;

alter table organizations enable row level security;
alter table members enable row level security;
alter table social_accounts enable row level security;
alter table posts enable row level security;

create policy "org members read org" on organizations for select using (is_member(id));
create policy "org members update org" on organizations for update using (is_member(id));

create policy "members see co-members" on members for select using (user_id = auth.uid() or is_member(org_id));

create policy "org accounts" on social_accounts for all using (is_member(org_id)) with check (is_member(org_id));
create policy "org posts" on posts for all using (is_member(org_id)) with check (is_member(org_id));
