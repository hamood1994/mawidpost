-- Carousel support in the autopilot library: a library item can carry extra images.
alter table media_library add column if not exists extra_urls text[] not null default '{}';
