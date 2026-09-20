-- Plans can only be changed by the platform operator (from /admin), not by company owners.
-- Otherwise anyone could pick "Scale" for free and bypass the trial.
create or replace function set_org_plan(o uuid, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'forbidden'; end if;
  update organizations set plan = p where id = o;
end $$;
