alter table public.website_scan_pages add column if not exists structured_data_scanned boolean not null default false;
