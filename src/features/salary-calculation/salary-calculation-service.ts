import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { getOverallReport } from '@/features/report/reports-service'

export type SalaryRoleKey =
  | 'accountant'
  | 'nutritionist'
  | 'aslap'
  | 'head'

export type SalaryAllocation = Record<SalaryRoleKey, number>

export type SalaryAllocationRow = {
  kitchen_id: string
  accountant_percent: number | string
  nutritionist_percent: number | string
  aslap_percent: number | string
  head_percent: number | string
  updated_at: string
}

export type SalaryCalculationInput = {
  kitchenId: string
  startDate: string
  endDate: string
}

export type SalaryRoleResult = {
  key: SalaryRoleKey
  label: string
  percent: number
  amount: number
}

export type KitchenSalaryCalculation = {
  kitchenId: string
  kitchenName: string
  startDate: string
  endDate: string
  totalRAB: number
  allocationRate: 30
  totalAllocation: number
  percentages: SalaryAllocation
  roles: SalaryRoleResult[]
}

export const DEFAULT_SALARY_ALLOCATION: SalaryAllocation = {
  accountant: 25,
  nutritionist: 25,
  aslap: 25,
  head: 25
}

const ROLE_LABELS: Record<SalaryRoleKey, string> = {
  accountant: 'Akuntan',
  nutritionist: 'Ahli Gizi',
  aslap: 'Aslap',
  head: 'Kepala SPPG'
}

function toNumber(value: number | string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function allocationFromRow(row: SalaryAllocationRow): SalaryAllocation {
  return {
    accountant: toNumber(row.accountant_percent),
    nutritionist: toNumber(row.nutritionist_percent),
    aslap: toNumber(row.aslap_percent),
    head: toNumber(row.head_percent)
  }
}

export function validateSalaryAllocation(
  allocation: SalaryAllocation
): string | null {
  const values = Object.values(allocation)

  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
    return 'Setiap persentase harus berada di antara 0 dan 100.'
  }

  if (values.some((value) => Math.abs(value * 100 - Math.round(value * 100)) > 1e-7)) {
    return 'Persentase maksimal menggunakan dua angka desimal.'
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  if (Math.round(total * 100) !== 10000) {
    return 'Total persentase pembagian harus tepat 100%.'
  }

  return null
}

export async function getKitchenSalaryAllocation(
  kitchenId: string,
  client: SupabaseClient = supabase
): Promise<SalaryAllocation> {
  if (!kitchenId) throw new Error('Dapur wajib dipilih.')

  const { data, error } = await client
    .from('kitchen_salary_allocations')
    .select(
      'kitchen_id,accountant_percent,nutritionist_percent,aslap_percent,head_percent,updated_at'
    )
    .eq('kitchen_id', kitchenId)
    .maybeSingle()

  if (error) throw error
  if (!data) return { ...DEFAULT_SALARY_ALLOCATION }

  return allocationFromRow(data as SalaryAllocationRow)
}

export async function saveKitchenSalaryAllocation(
  kitchenId: string,
  allocation: SalaryAllocation,
  client: SupabaseClient = supabase
): Promise<void> {
  if (!kitchenId) throw new Error('Dapur wajib dipilih.')

  const validationError = validateSalaryAllocation(allocation)
  if (validationError) throw new Error(validationError)

  const { error } = await client
    .from('kitchen_salary_allocations')
    .upsert(
      {
        kitchen_id: kitchenId,
        accountant_percent: allocation.accountant,
        nutritionist_percent: allocation.nutritionist,
        aslap_percent: allocation.aslap,
        head_percent: allocation.head,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'kitchen_id' }
    )

  if (error) throw error
}

export async function getKitchenSalaryCalculation(
  input: SalaryCalculationInput,
  client: SupabaseClient = supabase
): Promise<KitchenSalaryCalculation> {
  if (!input.kitchenId) throw new Error('Dapur wajib dipilih.')
  if (!input.startDate || !input.endDate) {
    throw new Error('Tanggal awal dan akhir wajib diisi.')
  }
  if (input.startDate > input.endDate) {
    throw new Error('Tanggal awal tidak boleh melewati tanggal akhir.')
  }

  const [report, percentages] = await Promise.all([
    getOverallReport(
      {
        startDate: input.startDate,
        endDate: input.endDate,
        kitchenId: input.kitchenId
      },
      client
    ),
    getKitchenSalaryAllocation(input.kitchenId, client)
  ])

  const kitchen = report.kitchens.find(
    (item) => item.kitchenId === input.kitchenId
  )

  if (!kitchen) {
    throw new Error('Data dapur tidak ditemukan atau dapur tidak aktif.')
  }

  const totalRAB = kitchen.totalRAB
  const totalAllocation = totalRAB * 0.3
  const roles = (Object.keys(ROLE_LABELS) as SalaryRoleKey[]).map((key) => ({
    key,
    label: ROLE_LABELS[key],
    percent: percentages[key],
    amount: totalAllocation * (percentages[key] / 100)
  }))

  return {
    kitchenId: kitchen.kitchenId,
    kitchenName: kitchen.kitchenName,
    startDate: input.startDate,
    endDate: input.endDate,
    totalRAB,
    allocationRate: 30,
    totalAllocation,
    percentages,
    roles
  }
}
