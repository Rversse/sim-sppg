create unique index if not exists transactions_ops_real_kitchen_date_unique
  on public.transactions (kitchen_id, transaction_date)
  where flow_type = 'ops_disbursement_real' and category = 'OPS';

create or replace function private.capture_ops_real_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'INSERT' then
    if new.flow_type <> 'ops_disbursement_real' or new.category <> 'OPS' then
      return new;
    end if;
    insert into public.ops_real_audit (
      transaction_id, action, actor_id, actor_role, actor_source,
      transaction_version, old_data, new_data
    ) values (
      new.id, 'INSERT', coalesce(new.edited_by, new.created_by, new.source_created_by),
      coalesce(new.edited_role, new.source_created_role, 'unknown'),
      coalesce(new.edited_source, new.source_system, 'system'),
      new.version, null, to_jsonb(new)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if (old.flow_type <> 'ops_disbursement_real' or old.category <> 'OPS')
       and (new.flow_type <> 'ops_disbursement_real' or new.category <> 'OPS') then
      return new;
    end if;
    new.version := old.version + 1;
    new.edited_at := now();
    insert into public.ops_real_audit (
      transaction_id, action, actor_id, actor_role, actor_source,
      transaction_version, old_data, new_data
    ) values (
      new.id, 'UPDATE', new.edited_by,
      coalesce(new.edited_role, 'unknown'),
      coalesce(new.edited_source, new.source_system, 'system'),
      new.version, to_jsonb(old), to_jsonb(new)
    );
    return new;
  elsif tg_op = 'DELETE' then
    if old.flow_type <> 'ops_disbursement_real' or old.category <> 'OPS' then
      return old;
    end if;
    insert into public.ops_real_audit (
      transaction_id, action, actor_id, actor_role, actor_source,
      transaction_version, old_data, new_data
    ) values (
      old.id, 'DELETE', old.edited_by, old.edited_role,
      coalesce(old.edited_source, old.source_system, 'system'),
      old.version, to_jsonb(old), null
    );
    return old;
  end if;
  return null;
end;
$function$;

revoke all on function private.capture_ops_real_audit() from public, anon, authenticated;
notify pgrst, 'reload schema';
