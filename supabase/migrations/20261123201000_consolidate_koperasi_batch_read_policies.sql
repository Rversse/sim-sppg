-- Consolidate Koperasi/Admin read policies and index all OPS audit foreign keys.

create index if not exists koperasi_ops_real_batch_rows_kitchen_idx
  on public.koperasi_ops_real_batch_rows (kitchen_id)
  where kitchen_id is not null;

drop policy if exists koperasi_ops_real_rows_admin_read
  on public.koperasi_ops_real_batch_rows;
drop policy if exists koperasi_ops_real_rows_koperasi_read_own
  on public.koperasi_ops_real_batch_rows;
drop policy if exists koperasi_ops_real_rows_select
  on public.koperasi_ops_real_batch_rows;
create policy koperasi_ops_real_rows_select
  on public.koperasi_ops_real_batch_rows
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and (
          p.role = 'admin'
          or (
            p.role = 'koperasi'
            and exists (
              select 1
              from public.real_import_batches b
              where b.id = koperasi_ops_real_batch_rows.batch_id
                and b.source_type = 'koperasi_ops_real'
                and b.created_by = (select auth.uid())
            )
          )
        )
    )
  );

drop policy if exists real_import_batches_admin_read
  on public.real_import_batches;
drop policy if exists real_import_batches_koperasi_read_own
  on public.real_import_batches;
drop policy if exists real_import_batches_koperasi_ops_real_read_own
  on public.real_import_batches;
drop policy if exists real_import_batches_select
  on public.real_import_batches;
create policy real_import_batches_select
  on public.real_import_batches
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and (
          p.role = 'admin'
          or (
            p.role = 'koperasi'
            and real_import_batches.created_by = (select auth.uid())
            and real_import_batches.source_type in ('koperasi', 'koperasi_ops_real')
          )
        )
    )
  );

drop policy if exists real_import_rows_admin_read
  on public.real_import_batch_rows;
drop policy if exists real_import_rows_koperasi_read_own
  on public.real_import_batch_rows;
drop policy if exists real_import_rows_select
  on public.real_import_batch_rows;
create policy real_import_rows_select
  on public.real_import_batch_rows
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and (
          p.role = 'admin'
          or (
            p.role = 'koperasi'
            and exists (
              select 1
              from public.real_import_batches b
              where b.id = real_import_batch_rows.batch_id
                and b.source_type = 'koperasi'
                and b.created_by = (select auth.uid())
            )
          )
        )
    )
  );
