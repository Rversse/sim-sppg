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
  allocation_rate: number | string
  updated_at: string
}

export type SalaryAllocationSettings = {
  allocation: SalaryAllocation
  allocationRate: number
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
  allocationRate: number
  totalAllocation: number
  percentages: SalaryAllocation
  roles: SalaryRoleResult[]
}

export const DEFAULT_SALARY_ALLOCATION_RATE = 30

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

export function adjustSalaryAllocation(
  current: SalaryAllocation,
  editedKey: SalaryRoleKey,
  requestedValue: number
): SalaryAllocation {
  const keys = Object.keys(ROLE_LABELS) as SalaryRoleKey[]
  const editedCents = Math.min(10000, Math.max(0, Math.round(requestedValue * 100)))
  const remainingCents = 10000 - editedCents
  const otherKeys = keys.filter((key) => key !== editedKey)
  const weights = otherKeys.map((key) => Math.max(0, Math.round(current[key] * 100)))
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)

  const shares = otherKeys.map((key, index) => {
    const exact = weightTotal > 0
      ? (remainingCents * weights[index]) / weightTotal
      : remainingCents / otherKeys.length
    return { key, cents: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })

  let centsLeft = remainingCents - shares.reduce((sum, share) => sum + share.cents, 0)
  shares.sort((a, b) => b.remainder - a.remainder || keys.indexOf(a.key) - keys.indexOf(b.key))
  for (let index = 0; index < shares.length && centsLeft > 0; index += 1, centsLeft -= 1) {
    shares[index].cents += 1
  }

  const result = { ...current, [editedKey]: editedCents / 100 }
  for (const share of shares) result[share.key] = share.cents / 100
  return result
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

export async function getKitchenSalarySettings(
  kitchenId: string,
  client: SupabaseClient = supabase
): Promise<SalaryAllocationSettings> {
  if (!kitchenId) throw new Error('Dapur wajib dipilih.')

  const { data, error } = await client
    .from('kitchen_salary_allocations')
    .select(
      'kitchen_id,accountant_percent,nutritionist_percent,aslap_percent,head_percent,allocation_rate,updated_at'
    )
    .eq('kitchen_id', kitchenId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return {
      allocation: { ...DEFAULT_SALARY_ALLOCATION },
      allocationRate: DEFAULT_SALARY_ALLOCATION_RATE
    }
  }

  const row = data as SalaryAllocationRow
  return {
    allocation: allocationFromRow(row),
    allocationRate: toNumber(row.allocation_rate)
  }
}

export async function getKitchenSalaryAllocation(
  kitchenId: string,
  client: SupabaseClient = supabase
): Promise<SalaryAllocation> {
  const settings = await getKitchenSalarySettings(kitchenId, client)
  return settings.allocation
}

export async function saveKitchenSalaryAllocation(
  kitchenId: string,
  allocation: SalaryAllocation,
  allocationRate = DEFAULT_SALARY_ALLOCATION_RATE,
  client: SupabaseClient = supabase
): Promise<void> {
  if (!kitchenId) throw new Error('Dapur wajib dipilih.')

  const validationError = validateSalaryAllocation(allocation)
  if (validationError) throw new Error(validationError)
  if (!Number.isFinite(allocationRate) || allocationRate < 0 || allocationRate > 100 || Math.round(allocationRate * 100) !== allocationRate * 100) {
    throw new Error('Alokasi sisa RAB harus berada di antara 0 dan 100 dengan maksimal dua angka desimal.')
  }

  const { error } = await client
    .from('kitchen_salary_allocations')
    .upsert(
      {
        kitchen_id: kitchenId,
        allocation_rate: allocationRate,
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

  const [report, settings] = await Promise.all([
    getOverallReport(
      {
        startDate: input.startDate,
        endDate: input.endDate,
        kitchenId: input.kitchenId
      },
      client
    ),
    getKitchenSalarySettings(input.kitchenId, client)
  ])

  const kitchen = report.kitchens.find(
    (item) => item.kitchenId === input.kitchenId
  )

  if (!kitchen) {
    throw new Error('Data dapur tidak ditemukan atau dapur tidak aktif.')
  }

  const totalRAB = kitchen.totalRAB
  const totalAllocation = totalRAB * (settings.allocationRate / 100)
  const roles = (Object.keys(ROLE_LABELS) as SalaryRoleKey[]).map((key) => ({
    key,
    label: ROLE_LABELS[key],
    percent: settings.allocation[key],
    amount: totalAllocation * (settings.allocation[key] / 100)
  }))

  return {
    kitchenId: kitchen.kitchenId,
    kitchenName: kitchen.kitchenName,
    startDate: input.startDate,
    endDate: input.endDate,
    totalRAB,
    allocationRate: settings.allocationRate,
    totalAllocation,
    percentages,
    roles
  }
}
