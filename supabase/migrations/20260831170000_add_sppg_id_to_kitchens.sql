alter table public.kitchens
  add column if not exists id_sppg text;

alter table public.kitchens
  add constraint kitchens_id_sppg_format_check
  check (
    id_sppg is null
    or id_sppg ~ '^[A-Z0-9]+$'
  );

create unique index if not exists kitchens_id_sppg_unique
  on public.kitchens (id_sppg)
  where id_sppg is not null;