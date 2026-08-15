import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type { Vehicle, VehicleInput } from './vehicle-types'

export async function getVehicles(
  client: SupabaseClient = supabase
): Promise<Vehicle[]> {
  const { data, error } = await client
    .from('kitchen_vehicles')
    .select(
      'id,kitchen_id,vehicle_type,vehicle_name,plate_number,pkb_expiry,stnk_expiry,kitchen:kitchens(name)'
    )
    .order('pkb_expiry', { ascending: true, nullsFirst: false })
    .order('stnk_expiry', { ascending: true, nullsFirst: false })

  if (error) throw error

  return (data ?? []) as unknown as Vehicle[]
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
  if (!input.plate_number.trim()) {
    throw new Error('Nomor polisi wajib diisi.')
  }
  if (!input.vehicle_type) {
    throw new Error('Jenis kendaraan wajib dipilih.')
  }
}
