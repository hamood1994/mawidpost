-- صفحة روابط لكل براند
alter table bio_pages add column if not exists id uuid not null default gen_random_uuid();
alter table bio_pages add column if not exists brand_id uuid references brands(id) on delete cascade;
alter table bio_pages drop constraint if exists bio_pages_pkey;
alter table bio_pages add primary key (id);
create unique index if not exists bio_pages_brand_uq on bio_pages(brand_id);
-- الصفحة الحالية تنربط بأول براند بالمنظمة
update bio_pages b set brand_id = (
  select br.id from brands br where br.org_id = b.org_id order by br.created_at limit 1
) where b.brand_id is null;
