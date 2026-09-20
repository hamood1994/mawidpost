-- المحرر: الأوتوبايلوت وصفحة الروابط وملف البراند لبراندات يملك صلاحيتها فقط
drop policy if exists "org autopilot write" on autopilot_rules;
create policy "org autopilot write" on autopilot_rules for all
  using (is_admin(org_id) or (member_role(org_id) = 'editor' and can_brand(org_id, brand_id)))
  with check (is_admin(org_id) or (member_role(org_id) = 'editor' and can_brand(org_id, brand_id)));

drop policy if exists "bio admin insert" on bio_pages;
drop policy if exists "bio admin update" on bio_pages;
drop policy if exists "bio admin delete" on bio_pages;
create policy "bio admin insert" on bio_pages for insert
  with check (is_admin(org_id) or (member_role(org_id) = 'editor' and brand_id is not null and can_brand(org_id, brand_id)));
create policy "bio admin update" on bio_pages for update
  using (is_admin(org_id) or (member_role(org_id) = 'editor' and brand_id is not null and can_brand(org_id, brand_id)))
  with check (is_admin(org_id) or (member_role(org_id) = 'editor' and brand_id is not null and can_brand(org_id, brand_id)));
create policy "bio admin delete" on bio_pages for delete
  using (is_admin(org_id) or (member_role(org_id) = 'editor' and brand_id is not null and can_brand(org_id, brand_id)));

-- المحرر يعدّل ملف براند (الاسم، الوصف...) لكن ليس خيار موافقة العميل
drop policy if exists "brands editor update" on brands;
create policy "brands editor update" on brands for update
  using (member_role(org_id) = 'editor' and can_brand(org_id, id))
  with check (member_role(org_id) = 'editor' and can_brand(org_id, id));
create or replace function brands_client_approval_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_approval is distinct from old.client_approval and not is_admin(new.org_id) then
    new.client_approval := old.client_approval;
  end if;
  return new;
end $$;
drop trigger if exists brands_ca_guard on brands;
create trigger brands_ca_guard before update on brands for each row execute function brands_client_approval_guard();
