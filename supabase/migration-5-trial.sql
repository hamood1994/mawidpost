-- MawidPost: 14-day free trial on the Starter plan.
-- Existing companies keep working (trial_ends_at stays NULL = no expiry).
alter table organizations add column if not exists trial_ends_at timestamptz;

create or replace function create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations (name, trial_ends_at) values (org_name, now() + interval '14 days') returning id into new_id;
  insert into members (org_id, user_id, role) values (new_id, auth.uid(), 'owner');
  insert into brands (org_id, name) values (new_id, org_name);
  return new_id;
end
$$;

-- Publishing queue: skip suspended companies AND expired Starter trials.
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
        and not exists (
          select 1 from organizations o
           where o.id = x.org_id
             and (o.suspended or (o.plan = 'starter' and o.trial_ends_at is not null and o.trial_ends_at < now())))
      order by x.scheduled_at
      limit batch
      for update skip locked)
  returning p.*;
end $$;
revoke execute on function claim_due_posts(int) from public, anon, authenticated;
grant execute on function claim_due_posts(int) to service_role;
