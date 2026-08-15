import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type { Vehicle, VehicleInput } from './vehicle-types'

type ProfileRow = { id: string; username: string | null }
type VehicleRow = Omit<Vehicle, 'created_by_name' | 'updated_by_name'>

async function getProfileNames(ids: string[], client: SupabaseClient) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (!uniqueIds.length) return new Map<string, string>()

  const { data, error } = await client.rpc('get_profile_names', {
    profile_ids: uniqueIds
  })
  if (error) throw error

  return new Map(
    ((data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile.username ?? profile.id
    ])
  )
}

export async function getVehicles(
  client: SupabaseClient = supabase
): Promise<Vehicle[]> {
  const { data, error } = await client
    .from('kitchen_vehicles')
    .select(
      'id,kitchen_id,vehicle_type,vehicle_name,plate_number,pkb_expiry,stnk_expiry,created_at,created_by,updated_at,updated_by,kitchen:kitchens(name)'
    )
    .order('pkb_expiry', { ascending: true, nullsFirst: false })
    .order('stnk_expiry', { ascending: true, nullsFirst: false })

  if (error) throw error

  const rows = (data ?? []) as unknown as VehicleRow[]
  const names = await getProfileNames(
    rows.flatMap((row) => [row.created_by ?? '', row.updated_by ?? '']),
    client
  )

  return rows.map((row) => ({
    ...row,
    created_by_name: row.created_by
      ? (names.get(row.created_by) ?? row.created_by)
      : null,
    updated_by_name: row.updated_by
      ? (names.get(row.updated_by) ?? row.updated_by)
      : null
  }))
}

export async function createVehicle(
  input: VehicleInput,
  client: SupabaseClient = supabase
) {
  validateVehicleInput(input)
  const { error } = await client.from('kitchen_vehicles').insert({
    kitchen_id: input.kitchen_id,
    vehicle_type: input.vehicle_type,
    vehicle_name: input.vehicle_name.trim() || null,
    plate_number: input.plate_number.trim(),
    pkb_expiry: input.pkb_expiry || null,
    stnk_expiry: input.stnk_expiry || null
  })
  if (error) throw error
}

export async function updateVehicle(
  id: string,
  input: VehicleInput,
  client: SupabaseClient = supabase
) {
  if (!id) throw new Error('ID kendaraan tidak ditemukan.')
  validateVehicleInput(input)
  const { error } = await client
    .from('kitchen_vehicles')
    .update({
      kitchen_id: input.kitchen_id,
      vehicle_type: input.vehicle_type,
      vehicle_name: input.vehicle_name.trim() || null,
      plate_number: input.plate_number.trim(),
      pkb_expiry: input.pkb_expiry || null,
      stnk_expiry: input.stnk_expiry || null
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteVehicle(
  id: string,
  client: SupabaseClient = supabase
) {
  if (!id) throw new Error('ID kendaraan tidak ditemukan.')
  const { error } = await client.from('kitchen_vehicles').delete().eq('id', id)
  if (error) throw error
}

function validateVehicleInput(input: VehicleInput) {
  if (!input.kitchen_id) throw new Error('Pilih dapur.')
  if (!input.plate_number.trim()) throw new Error('Nomor polisi wajib diisi.')
  if (!input.vehicle_type) throw new Error('Jenis kendaraan wajib dipilih.')
}
