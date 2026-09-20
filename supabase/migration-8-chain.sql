-- Two-step approval: editor -> manager -> client. Set per brand.
alter table brands add column if not exists client_approval boolean not null default false;
