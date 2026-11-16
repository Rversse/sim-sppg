-- Daily Maker HISTORY foundation. Existing tables are empty; preserve their structure and RLS.
alter table public.maker_drafts
  add column if not exists transaction_date date,
  add column if not exists version integer not null default 1,
  add column if not exists last_event_at timestamptz;

create unique index if not exists maker_drafts_kitchen_transaction_date_uidx
  on public.maker_drafts (kitchen_id, transaction_date)
  where transaction_date is not null;

create index if not exists maker_drafts_kitchen_created_at_idx
  on public.maker_drafts (kitchen_id, created_at desc);

create index if not exists maker_history_draft_created_at_idx
  on public.maker_history (draft_id, created_at asc);

create index if not exists maker_history_kitchen_created_at_idx
  on public.maker_history (kitchen_id, created_at desc);

-- The 24-hour deadline is derived from the immutable initial created_at:
-- created_at + interval '24 hours'. It must not reset on revisions/additions.
comment on column public.maker_drafts.created_at is
  'Immutable start of the daily HISTORY lock window; lock deadline is created_at + 24 hours.';
comment on column public.maker_drafts.payload is
  'Latest canonical daily snapshot. Incremental revisions/additions are separately recorded in maker_history.';
comment on column public.maker_drafts.version is
  'Monotonically increasing snapshot version; increments on each accepted change.';
comment on column public.maker_drafts.transaction_date is
  'Single local transaction date for this kitchen HISTORY; unique per kitchen/date.';
