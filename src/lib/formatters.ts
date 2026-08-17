const DATE_SHORT_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
})

const DATE_LONG_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'long',
  year: 'numeric'
})

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

const DATE_TIME_SECONDS_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

const CURRENCY_FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
})

const NUMBER_FORMATTER = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0
})

function parseDateValue(value: string | Date) {
  if (value instanceof Date) {
    return value
  }

  // Date-only value: keep it in local time to avoid timezone shifting.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`)
  }

  return new Date(value)
}

export function getTodayLocal() {
  const now = new Date()

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function formatDate(value: string | Date) {
  return DATE_SHORT_FORMATTER.format(parseDateValue(value))
}

export function formatDateLong(value: string | Date) {
  return DATE_LONG_FORMATTER.format(parseDateValue(value))
}

function formatDateTimeParts(
  formatter: Intl.DateTimeFormat,
  value: string | Date
) {
  const parts = formatter.formatToParts(parseDateValue(value))
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

export function formatDateTime(value: string | Date) {
  const values = formatDateTimeParts(DATE_TIME_FORMATTER, value)

  return `${values.day} ${values.month} ${values.year}, ${values.hour}:${values.minute}`
}

export function formatDateTimeWithSeconds(value: string | Date) {
  const values = formatDateTimeParts(DATE_TIME_SECONDS_FORMATTER, value)

  return `${values.day} ${values.month} ${values.year}, ${values.hour}:${values.minute}:${values.second}`
}

export function formatCurrency(value: number) {
  return CURRENCY_FORMATTER.format(value)
}

export function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value)
}
