import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { PROGRAM_START_DATE } from '@/lib/app-config'

const PERIOD_ANCHOR_DATE = PROGRAM_START_DATE
const PERIOD_LENGTH_DAYS = 14
const PERIOD_CHECKLIST_OFFSET_DAYS = 11

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

export type DisbursementPeriod = {
  number: number
  startDate: string
  endDate: string
  checklistDate: string
  label: string
}

export type DisbursementRow = {
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

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatIsoDate(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')
  ].join('-')
}

function addDays(value: string, days: number): string {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return formatIsoDate(date)
}

function dateDiffDays(startDate: string, endDate: string): number {
  const start = parseDate(startDate)
  const end = parseDate(endDate)

  return Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  )
}

function getLocalToday(): string {
  return formatIsoDate(new Date())
}

function formatPeriodDate(value: string): string {
  const date = parseDate(value)

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

export function getDisbursementPeriod(periodNumber: number): DisbursementPeriod {
  const safeNumber = Math.max(1, Math.floor(periodNumber))
  const startDate = addDays(
    PERIOD_ANCHOR_DATE,
    (safeNumber - 1) * PERIOD_LENGTH_DAYS
  )
  const endDate = addDays(startDate, PERIOD_LENGTH_DAYS - 1)
  const checklistDate = addDays(startDate, PERIOD_CHECKLIST_OFFSET_DAYS)

  return {
    number: safeNumber,
    startDate,
    endDate,
    checklistDate,
    label: `Periode ${safeNumber} • ${formatPeriodDate(startDate)} — ${formatPeriodDate(endDate)}`
  }
}

export function getCurrentDisbursementPeriod(
  today = getLocalToday()
): DisbursementPeriod {
  const daysFromAnchor = dateDiffDays(PERIOD_ANCHOR_DATE, today)
  const periodNumber =
    daysFromAnchor < 0
      ? 1
      : Math.floor(daysFromAnchor / PERIOD_LENGTH_DAYS) + 1

  return getDisbursementPeriod(periodNumber)
}

export function getDisbursementPeriods(
  upToDate = getLocalToday()
): DisbursementPeriod[] {
  const currentPeriod = getCurrentDisbursementPeriod(upToDate)

  return Array.from(
    { length: currentPeriod.number },
    (_, index) => getDisbursementPeriod(index + 1)
  ).reverse()
}

export function getNearestFriday(value = new Date()): string {
  const today = new Date(value)
  today.setHours(0, 0, 0, 0)

  const previousFriday = new Date(today)
  const nextFriday = new Date(today)

  const prevDiff =
    previousFriday.getDay() >= 5
      ? previousFriday.getDay() - 5
      : previousFriday.getDay() + 2

  previousFriday.setDate(previousFriday.getDate() - prevDiff)
  nextFriday.setDate(previousFriday.getDate() + 7)

  const diffPrev = Math.abs(today.getTime() - previousFriday.getTime())
  const diffNext = Math.abs(today.getTime() - nextFriday.getTime())
  const target = diffPrev <= diffNext ? previousFriday : nextFriday

  return formatIsoDate(target)
}

export function isDisbursementLocked(checklistDate: string, now = new Date()) {
  const selectedDate = parseDate(checklistDate)
  const today = new Date(now)

  today.setHours(0, 0, 0, 0)

  const diffDays = Math.floor(
    (today.getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  return diffDays > 7
}

export function calculateDisbursementProgress(
  record: DisbursementChecklist | null
): number {
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

export async function getDisbursementRows(
  checklistDate: string,
  client: SupabaseClient = supabase
): Promise<DisbursementRow[]> {
  const [
    { data: kitchens, error: kitchenError },
    { data: checklistRows, error: checklistError }
  ] = await Promise.all([
    client
      .from('kitchens')
      .select('id,name')
      .eq('include_disbursement', true)
      .eq('is_active', true)
      .order('name'),
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
      progress: calculateDisbursementProgress(checklist)
    }
  })
}

export function summarizeDisbursementRows(
  rows: DisbursementRow[]
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
  if (isDisbursementLocked(checklistDate)) {
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
