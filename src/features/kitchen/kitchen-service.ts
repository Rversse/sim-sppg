import { supabase } from '@/lib/supabase'
import type { Kitchen, KitchenInput } from './kitchen-types'

export async function getKitchens(client = supabase): Promise<Kitchen[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name,pic,foundation,address,is_active')
    .order('name')

  if (error) throw error

  return (data ?? []) as Kitchen[]
}

export async function getActiveKitchens(
  client = supabase
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

function toKitchenRecord(input: KitchenInput) {
  return {
    name: input.name.trim(),
    pic: input.pic.trim() || null,
    foundation: input.foundation.trim() || null,
    address: input.address.trim() || null,
    is_active: input.is_active
  }
}

export async function createKitchen(
  input: KitchenInput,
  client = supabase
): Promise<Pick<Kitchen, 'id'>> {
  const validationError = validateKitchenInput(input)

  if (validationError) {
    throw new Error(validationError)
  }

  const { data, error } = await client
    .from('kitchens')
    .insert(toKitchenRecord(input))
    .select('id')
    .single()

  if (error) throw error
  return data as Pick<Kitchen, 'id'>
}

export async function updateKitchen(
  id: string,
  input: KitchenInput,
  client = supabase
): Promise<void> {
  if (!id) throw new Error('ID dapur tidak ditemukan.')

  const validationError = validateKitchenInput(input)

  if (validationError) {
    throw new Error(validationError)
  }

  const { error } = await client
    .from('kitchens')
    .update(toKitchenRecord(input))
    .eq('id', id)

  if (error) throw error
}

export async function deleteKitchen(
  id: string,
  client = supabase
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
