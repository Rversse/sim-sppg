import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type { Kitchen, KitchenInput } from './kitchen-types'

type ProfileRow = { id: string; username: string | null }

type KitchenRow = Omit<Kitchen, 'created_by_name' | 'updated_by_name'>

async function getProfileNames(
  ids: string[],
  client: SupabaseClient
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (!uniqueIds.length) return new Map()

  const { data, error } = await client
    .from('profiles')
    .select('id,username')
    .in('id', uniqueIds)

  if (error) throw error

  return new Map(
    ((data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile.username ?? profile.id
    ])
  )
}

export async function getKitchens(
  client: SupabaseClient = supabase
): Promise<Kitchen[]> {
  const { data, error } = await client
    .from('kitchens')
    .select(
      'id,name,pic,foundation,address,is_active,created_at,created_by,updated_at,updated_by'
    )
    .order('name')

  if (error) throw error

  const rows = (data ?? []) as KitchenRow[]
  const profileNames = await getProfileNames(
    rows.flatMap((row) => [row.created_by ?? '', row.updated_by ?? '']),
    client
  )

  return rows.map((row) => ({
    ...row,
    created_by_name: row.created_by
      ? (profileNames.get(row.created_by) ?? row.created_by)
      : null,
    updated_by_name: row.updated_by
      ? (profileNames.get(row.updated_by) ?? row.updated_by)
      : null
  }))
}

export async function getActiveKitchens(
  client: SupabaseClient = supabase
): Promise<Pick<Kitchen, 'id' | 'name'>[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return (data ?? []) as Pick<Kitchen, 'id' | 'name'>[]
}

function validateKitchenInput(input: KitchenInput): string | null {
  if (!input.name.trim()) return 'Nama dapur wajib diisi.'
  return null
}

export async function createKitchen(
  input: KitchenInput,
  client: SupabaseClient = supabase
): Promise<Pick<Kitchen, 'id'>> {
  const validationError = validateKitchenInput(input)
  if (validationError) throw new Error(validationError)

  const { data, error } = await client
    .from('kitchens')
    .insert({
      name: input.name.trim(),
      pic: input.pic.trim() || null,
      foundation: input.foundation.trim() || null,
      address: input.address.trim() || null,
      is_active: input.is_active
    })
    .select('id')
    .single()

  if (error) throw error
  return data as Pick<Kitchen, 'id'>
}

export async function updateKitchen(
  id: string,
  input: KitchenInput,
  client: SupabaseClient = supabase
): Promise<void> {
  if (!id) throw new Error('ID dapur tidak ditemukan.')

  const validationError = validateKitchenInput(input)
  if (validationError) throw new Error(validationError)

  const { error } = await client
    .from('kitchens')
    .update({
      name: input.name.trim(),
      pic: input.pic.trim() || null,
      foundation: input.foundation.trim() || null,
      address: input.address.trim() || null,
      is_active: input.is_active
    })
    .eq('id', id)

  if (error) throw error
}

export async function deleteKitchen(
  id: string,
  client: SupabaseClient = supabase
): Promise<void> {
  if (!id) throw new Error('ID dapur tidak ditemukan.')

  const checks = await Promise.all([
    client
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('kitchen_id', id),
    client
      .from('kitchen_account_rules')
      .select('*', { count: 'exact', head: true })
      .eq('kitchen_id', id),
    client
      .from('kitchen_supplier_rules')
      .select('*', { count: 'exact', head: true })
      .eq('kitchen_id', id),
    client
      .from('disbursement_checklists')
      .select('*', { count: 'exact', head: true })
      .eq('kitchen_id', id),
    client
      .from('kitchen_vehicles')
      .select('*', { count: 'exact', head: true })
      .eq('kitchen_id', id)
  ])

  for (const check of checks) {
    if (check.error) throw check.error
  }

  const labels = [
    'transaksi',
    'mapping rekening',
    'mapping supplier',
    'checklist',
    'kendaraan'
  ]
  const dependency = checks.findIndex((check) => (check.count ?? 0) > 0)
  if (dependency >= 0) {
    throw new Error(
      `Dapur tidak dapat dihapus karena masih memiliki ${labels[dependency]}.`
    )
  }

  const { error } = await client.from('kitchens').delete().eq('id', id)
  if (error) throw error
}
