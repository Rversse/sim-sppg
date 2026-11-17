drop policy if exists "kitchens koperasi select" on public.kitchens;
create policy "kitchens koperasi select" on public.kitchens
for select to authenticated
using (
  is_active
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'koperasi')
);

drop policy if exists "suppliers koperasi select" on public.suppliers;
create policy "suppliers koperasi select" on public.suppliers
for select to authenticated
using (
  lower(btrim(name)) = 'koperasi arutala'
  and is_active
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'koperasi')
);
