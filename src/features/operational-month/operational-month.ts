export const OPERATIONAL_MONTH_ANCHOR = '2026-04-13'
export const OPERATIONAL_MONTH_DAYS = 28

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatISODate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export type OperationalMonthRange = {
  month: number
  startDate: string
  endDate: string
  day: number
  days: number
  progress: number
}

export function getOperationalMonthRange(date: string): OperationalMonthRange {
  const anchor = parseDate(OPERATIONAL_MONTH_ANCHOR)
  const current = parseDate(date)
  const offset = Math.floor((current.getTime() - anchor.getTime()) / 86400000)
  const monthIndex = Math.floor(offset / OPERATIONAL_MONTH_DAYS)
  const start = new Date(anchor.getTime() + monthIndex * OPERATIONAL_MONTH_DAYS * 86400000)
  const day = offset - monthIndex * OPERATIONAL_MONTH_DAYS + 1
  return {
    month: monthIndex + 1,
    startDate: formatISODate(start),
    endDate: formatISODate(new Date(start.getTime() + (OPERATIONAL_MONTH_DAYS - 1) * 86400000)),
    day,
    days: OPERATIONAL_MONTH_DAYS,
    progress: Math.max(0, Math.min(100, (day / OPERATIONAL_MONTH_DAYS) * 100))
  }
}

export function getOperationalMonthOptions(date: string): OperationalMonthRange[] {
  const current = getOperationalMonthRange(date)
  return Array.from({ length: Math.max(1, current.month) }, (_, index) => {
    const startDate = formatISODate(new Date(parseDate(OPERATIONAL_MONTH_ANCHOR).getTime() + index * OPERATIONAL_MONTH_DAYS * 86400000))
    return getOperationalMonthRange(startDate)
  })
}
