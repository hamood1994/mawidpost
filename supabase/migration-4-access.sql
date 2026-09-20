-- MawidPost migration 4: super-admin, per-employee brand access, client role + portal, content plans.
-- Run ONCE in Supabase SQL Editor, after migration-3-autopilot.sql.

-- ───────────────────────── Platform super-admin ─────────────────────────
create table if not exists platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table platform_admins enable row level security;  -- no policies: only the server (service role) can read it

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- The operator accounts (only rows for emails that already exist are inserted).
insert into platform_admins (user_id)
select id from auth.users where lower(email) in ('madrid-_-94@live.com', 'mohamadlebanon94@gmail.com')
on conflict do nothing;

alter table organizations add column if not exists suspended boolean not null default false;

-- ───────────────────────── Roles: add "client" ─────────────────────────
alter table members drop constraint if exists members_role_check;
alter table members add constraint members_role_check check (role in ('owner', 'admin', 'editor', 'client'));
alter table invites drop constraint if exists invites_role_check;
alter table invites add constraint invites_role_check check (role in ('admin', 'editor', 'client'));
alter table invites add column if not exists brand_ids uuid[] not null default '{}';

-- Which brands (clients) each employee / client user may see. Owners and admins always see all.
create table if not exists member_brands (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  primary key (user_id, brand_id)
);
alter table member_brands enable row level security;
drop policy if exists "own or admin brand access" on member_brands;
create policy "own or admin brand access" on member_brands for select using (user_id = auth.uid() or is_admin(org_id));

-- Keep today's behaviour for existing editors: they keep access to every brand.
insert into member_brands (org_id, user_id, brand_id)
select m.org_id, m.user_id, b.id from members m join brands b on b.org_id = m.org_id where m.role = 'editor'
on conflict do nothing;

create or replace function can_brand(o uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when exists (select 1 from members where org_id = o and user_id = auth.uid() and role in ('owner', 'admin')) then true
    else exists (select 1 from member_brands mb where mb.org_id = o and mb.user_id = auth.uid() and mb.brand_id = b)
  end
$$;

create or replace function can_account(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from social_accounts s where s.id = a and can_brand(s.org_id, s.brand_id))
$$;

-- ───────────────────────── Row-level security, tightened ─────────────────────────
alter table posts add column if not exists for_client boolean not null default false;
alter table post_comments add column if not exists internal boolean not null default false;
alter table autopilot_rules add column if not exists send_to_client boolean not null default false;

-- brands
drop policy if exists "org brands read" on brands;
create policy "org brands read" on brands for select using (is_member(org_id) and can_brand(org_id, id));

-- social accounts: everyone sees their brands' accounts; only admins change them
drop policy if exists "org accounts" on social_accounts;
drop policy if exists "accounts select" on social_accounts;
drop policy if exists "accounts write" on social_accounts;
create policy "accounts select" on social_accounts for select using (is_member(org_id) and can_brand(org_id, brand_id));
create policy "accounts write" on social_accounts for all using (is_admin(org_id)) with check (is_admin(org_id));

-- posts: clients only see what is scheduled/published or waiting for THEIR approval
drop policy if exists "org posts" on posts;
drop policy if exists "posts select" on posts;
drop policy if exists "posts insert" on posts;
drop policy if exists "posts update" on posts;
drop policy if exists "posts delete" on posts;
create policy "posts select" on posts for select using (
  is_member(org_id) and (
    is_admin(org_id)
    or (account_id is not null and can_account(account_id)
        and (member_role(org_id) <> 'client'
             or status in ('scheduled', 'publishing', 'published')
             or (status = 'pending' and for_client)))
  )
);
create policy "posts insert" on posts for insert with check (
  is_admin(org_id) or (member_role(org_id) = 'editor' and account_id is not null and can_account(account_id))
);
create policy "posts update" on posts for update
  using (is_admin(org_id) or (member_role(org_id) = 'editor' and account_id is not null and can_account(account_id)))
  with check (is_admin(org_id) or (member_role(org_id) = 'editor' and account_id is not null and can_account(account_id)));
create policy "posts delete" on posts for delete using (
  is_admin(org_id) or (member_role(org_id) = 'editor' and account_id is not null and can_account(account_id))
);

-- media library + autopilot: staff only
drop policy if exists "org media library" on media_library;
create policy "org media library" on media_library for all
  using (member_role(org_id) in ('owner', 'admin', 'editor') and can_brand(org_id, brand_id))
  with check (member_role(org_id) in ('owner', 'admin', 'editor') and can_brand(org_id, brand_id));
drop policy if exists "org autopilot read" on autopilot_rules;

-- saved captions / hashtags: staff only
drop policy if exists "org captions" on saved_captions;
drop policy if exists "org hashtags" on hashtag_groups;
create policy "org captions" on saved_captions for all
  using (member_role(org_id) in ('owner', 'admin', 'editor')) with check (member_role(org_id) in ('owner', 'admin', 'editor'));
create policy "org hashtags" on hashtag_groups for all
  using (member_role(org_id) in ('owner', 'admin', 'editor')) with check (member_role(org_id) in ('owner', 'admin', 'editor'));

-- comments: clients never see internal notes
drop policy if exists "org post comments" on post_comments;
drop policy if exists "pc select" on post_comments;
drop policy if exists "pc insert" on post_comments;
drop policy if exists "pc delete" on post_comments;
create policy "pc select" on post_comments for select using (
  is_member(org_id) and exists (select 1 from posts p where p.id = post_id and p.org_id = post_comments.org_id)
  and (member_role(org_id) <> 'client' or not internal)
);
create policy "pc insert" on post_comments for insert with check (
  is_member(org_id) and exists (select 1 from posts p where p.id = post_id and p.org_id = post_comments.org_id)
  and (member_role(org_id) <> 'client' or not internal)
);
create policy "pc delete" on post_comments for delete using (is_admin(org_id));

-- members list: yourself, or everyone if you are owner/admin
drop policy if exists "members see co-members" on members;
create policy "members see co-members" on members for select using (user_id = auth.uid() or is_admin(org_id));

-- ───────────────────────── Team functions ─────────────────────────
drop function if exists org_members(uuid);
create function org_members(o uuid) returns table (user_id uuid, email text, role text, brand_ids uuid[])
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role,
         coalesce((select array_agg(mb.brand_id) from member_brands mb where mb.org_id = o and mb.user_id = m.user_id), '{}')
    from members m join auth.users u on u.id = m.user_id
   where m.org_id = o and is_admin(o)
   order by m.role, u.email
$$;

create or replace function set_member_brands(o uuid, uid uuid, ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(o) then raise exception 'forbidden'; end if;
  delete from member_brands where org_id = o and user_id = uid;
  insert into member_brands (org_id, user_id, brand_id)
  select o, uid, b.id from brands b where b.org_id = o and b.id = any (ids);
end $$;

create or replace function set_member_role(o uuid, uid uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if member_role(o) <> 'owner' then raise exception 'forbidden'; end if;
  if new_role not in ('admin', 'editor', 'client') then raise exception 'invalid_role'; end if;
  update members set role = new_role where org_id = o and user_id = uid and role <> 'owner';
end $$;

create or replace function remove_member(o uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if not is_admin(o) then raise exception 'forbidden'; end if;
  select role into r from members where org_id = o and user_id = uid;
  if r = 'owner' then raise exception 'cannot_remove_owner'; end if;
  delete from member_brands where org_id = o and user_id = uid;
  delete from members where org_id = o and user_id = uid;
end $$;

-- Clients do not count against the plan's member limit.
create or replace function accept_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype; lim int; n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into inv from invites where token = invite_token and accepted_at is null;
  if not found then raise exception 'invite_invalid'; end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'invite_email_mismatch'; end if;
  if not exists (select 1 from members where org_id = inv.org_id and user_id = auth.uid()) then
    if inv.role <> 'client' then
      select pl.max_members into lim from organizations o join plans pl on pl.id = o.plan where o.id = inv.org_id;
      select count(*) into n from members where org_id = inv.org_id and role <> 'client';
      if n >= lim then raise exception 'plan_limit_members'; end if;
    end if;
    insert into members (org_id, user_id, role) values (inv.org_id, auth.uid(), inv.role);
  end if;
  insert into member_brands (org_id, user_id, brand_id)
  select inv.org_id, auth.uid(), b.id from brands b where b.org_id = inv.org_id and b.id = any (inv.brand_ids)
  on conflict do nothing;
  update invites set accepted_at = now() where id = inv.id;
  return inv.org_id;
end $$;

-- ───────────────────────── Client approvals ─────────────────────────
create or replace function review_post(p_post uuid, p_decision text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare p posts%rowtype; r text; note text := coalesce(trim(p_note), '');
begin
  select * into p from posts where id = p_post;
  if not found then raise exception 'not_found'; end if;
  r := member_role(p.org_id);
  if r is null or r = 'editor' or p.account_id is null or not can_account(p.account_id) then raise exception 'forbidden'; end if;
  if p.status <> 'pending' or (r = 'client' and not p.for_client) then raise exception 'not_pending'; end if;
  if p_decision = 'approve' then
    update posts set status = 'scheduled' where id = p_post;
  elsif p_decision = 'changes' then
    update posts set status = 'draft', for_client = false where id = p_post;
  else
    raise exception 'invalid_decision';
  end if;
  insert into post_comments (post_id, org_id, author, author_email, body, internal)
  values (p_post, p.org_id, auth.uid(), auth.jwt() ->> 'email',
          case when p_decision = 'approve' then '✓ تمت الموافقة' || case when note <> '' then ' — ' || note else '' end
               else '↩ طلب تعديل: ' || note end, false);
end $$;
grant execute on function review_post(uuid, text, text) to authenticated;

-- ───────────────────────── Monthly content plan per brand ─────────────────────────
create table if not exists brand_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  month date not null,                              -- first day of the month
  notes text not null default '',
  target_posts int not null default 0,
  target_reels int not null default 0,
  target_stories int not null default 0,
  themes jsonb not null default '[]',               -- [{ "title": "...", "note": "..." }]
  unique (brand_id, month)
);
alter table brand_plans enable row level security;
drop policy if exists "plans read" on brand_plans;
drop policy if exists "plans write" on brand_plans;
create policy "plans read" on brand_plans for select using (is_member(org_id) and can_brand(org_id, brand_id));
create policy "plans write" on brand_plans for all
  using (member_role(org_id) in ('owner', 'admin', 'editor') and can_brand(org_id, brand_id))
  with check (member_role(org_id) in ('owner', 'admin', 'editor') and can_brand(org_id, brand_id));

-- ───────────────────────── Client uploads (materials for the agency) ─────────────────────────
create table if not exists client_uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  url text,
  note text not null default '',
  author_email text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table client_uploads enable row level security;
drop policy if exists "uploads read" on client_uploads;
drop policy if exists "uploads insert" on client_uploads;
drop policy if exists "uploads delete" on client_uploads;
create policy "uploads read" on client_uploads for select using (is_member(org_id) and can_brand(org_id, brand_id));
create policy "uploads insert" on client_uploads for insert with check (is_member(org_id) and can_brand(org_id, brand_id));
create policy "uploads delete" on client_uploads for delete using (is_admin(org_id));

-- ───────────────────────── Publishing queue skips suspended companies ─────────────────────────
create or replace function claim_due_posts(batch int default 5) returns setof posts
language plpgsql security definer set search_path = public as $$
begin
  update posts set status = 'failed', error = 'انتهت مهلة النشر', claimed_at = null
   where status = 'publishing' and claimed_at < now() - interval '20 minutes';

  return query
  update posts p set status = 'publishing', claimed_at = now()
   where p.id in (
     select x.id from posts x
      where x.status = 'scheduled' and x.scheduled_at + (x.attempts * interval '3 minutes') <= now()
        and not exists (select 1 from organizations o where o.id = x.org_id and o.suspended)
      order by x.scheduled_at
      limit batch
      for update skip locked)
  returning p.*;
end $$;
revoke execute on function claim_due_posts(int) from public, anon, authenticated;
grant execute on function claim_due_posts(int) to service_role;
