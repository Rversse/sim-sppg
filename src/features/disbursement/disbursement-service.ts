import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { DAILY_DISBURSEMENT_START_DATE } from '@/lib/app-config'

export const DISBURSEMENT_ITEMS = [
  { key: 'relawan', label: 'Gaji Relawan' },
  { key: 'pic_sekolah', label: 'Insentif PIC Guru' },
  { key: 'kader_posyandu', label: 'Insentif Kader Posyandu' },
  { key: 'sewa_kendaraan', label: 'Sewa Kendaraan' },
  { key: 'fasilitas_sppg', label: 'Sewa SPPG' }
] as const

export type DisbursementField = (typeof DISBURSEMENT_ITEMS)[number]['key']

export type DisbursementKitchen = {
  id: string
  name: string
}

export type DisbursementChecklist = {
  id: string
  kitchen_id: string
  checklist_date: string
  relawan: boolean
  pic_sekolah: boolean
  kader_posyandu: boolean
  sewa_kendaraan: boolean
  fasilitas_sppg: boolean
}

export type DailyDisbursementRow = {
  kitchen: DisbursementKitchen
  checklist: DisbursementChecklist | null
  progress: number
}

export type DisbursementSummary = {
  totalKitchens: number
  completedKitchens: number
  notStartedCount: number
  inProgressCount: number
  overallProgress: number
}

function calculateProgress(record: DisbursementChecklist | null): number {
  if (!record) return 0

  const completed = DISBURSEMENT_ITEMS.filter(({ key }) => record[key]).length

  return Math.round((completed / DISBURSEMENT_ITEMS.length) * 100)
}

export function getDisbursementProgressClass(progress: number): string {
  if (progress === 100) return 'progress-complete'
  if (progress >= 80) return 'progress-high'
  if (progress >= 40) return 'progress-medium'
  if (progress > 0) return 'progress-low'
  return 'progress-empty'
}

export async function getDailyDisbursementRows(
  checklistDate: string,
  kitchenId = '',
  client: SupabaseClient = supabase
): Promise<DailyDisbursementRow[]> {
  if (checklistDate < DAILY_DISBURSEMENT_START_DATE) {
    return []
  }

  let kitchenQuery = client
    .from('kitchens')
    .select('id,name')
    .eq('include_disbursement', true)
    .eq('is_active', true)
    .order('name')

  if (kitchenId) {
    kitchenQuery = kitchenQuery.eq('id', kitchenId)
  }

  const [
    { data: kitchens, error: kitchenError },
    { data: checklistRows, error: checklistError }
  ] = await Promise.all([
    kitchenQuery,
    client
      .from('disbursement_checklists')
      .select(
        'id,kitchen_id,checklist_date,relawan,pic_sekolah,kader_posyandu,sewa_kendaraan,fasilitas_sppg'
      )
      .eq('checklist_date', checklistDate)
  ])

  if (kitchenError) throw kitchenError
  if (checklistError) throw checklistError

  const checklistMap = new Map<string, DisbursementChecklist>()

  for (const row of (checklistRows ?? []) as DisbursementChecklist[]) {
    checklistMap.set(row.kitchen_id, row)
  }

  return ((kitchens ?? []) as DisbursementKitchen[]).map((kitchen) => {
    const checklist = checklistMap.get(kitchen.id) ?? null

    return {
      kitchen,
      checklist,
      progress: calculateProgress(checklist)
    }
  })
}

export async function getDailyDisbursementKitchens(
  client: SupabaseClient = supabase
): Promise<DisbursementKitchen[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name')
    .eq('include_disbursement', true)
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  return (data ?? []) as DisbursementKitchen[]
}

export function summarizeDisbursementRows(
  rows: DailyDisbursementRow[]
): DisbursementSummary {
  let completedKitchens = 0
  let notStartedCount = 0
  let inProgressCount = 0
  let totalProgress = 0

  for (const row of rows) {
    totalProgress += row.progress

    if (row.progress === 0) {
      notStartedCount += 1
    } else if (row.progress === 100) {
      completedKitchens += 1
    } else {
      inProgressCount += 1
    }
  }

  return {
    totalKitchens: rows.length,
    completedKitchens,
    notStartedCount,
    inProgressCount,
    overallProgress: rows.length
      ? Math.round(totalProgress / rows.length)
      : 0
  }
}

export async function saveDisbursementCheckbox(
  kitchenId: string,
  checklistDate: string,
  field: DisbursementField,
  value: boolean,
  client: SupabaseClient = supabase
): Promise<void> {
  if (!kitchenId) {
    throw new Error('Dapur tidak ditemukan')
  }

  if (!checklistDate) {
    throw new Error('Tanggal checklist tidak ditemukan')
  }

  if (checklistDate < DAILY_DISBURSEMENT_START_DATE) {
    return
  }

  const { data: existingRow, error: existingError } = await client
    .from('disbursement_checklists')
    .select('id')
    .eq('kitchen_id', kitchenId)
    .eq('checklist_date', checklistDate)
    .maybeSingle()

  if (existingError) throw existingError

  if (existingRow) {
    const { error } = await client
      .from('disbursement_checklists')
      .update({ [field]: value })
      .eq('id', existingRow.id)

    if (error) throw error
    return
  }

  const { error } = await client.from('disbursement_checklists').insert({
    kitchen_id: kitchenId,
    checklist_date: checklistDate,
    relawan: false,
    pic_sekolah: false,
    kader_posyandu: false,
    sewa_kendaraan: false,
    fasilitas_sppg: false,
    [field]: value
  })

  if (error) throw error
}

export function getDisbursementRowProgress(
  record: DisbursementChecklist | null
): number {
  return calculateProgress(record)
}
