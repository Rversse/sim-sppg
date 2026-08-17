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

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(parseDateValue(value))
}

export function formatDateLong(value: string | Date) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(parseDateValue(value))
}

export function formatDateTime(value: string | Date) {
  const parts = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(parseDateValue(value))

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )

  return `${values.day} ${values.month} ${values.year}, ${values.hour}:${values.minute}`
}

export function formatDateTimeWithSeconds(value: string | Date) {
  const parts = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(parseDateValue(value))

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )

  return `${values.day} ${values.month} ${values.year}, ${values.hour}:${values.minute}:${values.second}`
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0
  }).format(value)
}
