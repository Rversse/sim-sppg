import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type SingleDatePickerProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

const WEEK_DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

const MONTH_NAMES = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(
    new Date(Date.UTC(2020, index, 1))
  )
)

const MONTH_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric'
})

const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
})

const CURRENT_YEAR = new Date().getFullYear()

function getTodayKey() {
  const now = new Date()

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toDateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function addMonths(date: Date, amount: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1)
  )
}

function getMonthCells(month: Date) {
  const year = month.getUTCFullYear()
  const monthIndex = month.getUTCMonth()
  const firstDay = new Date(Date.UTC(year, monthIndex, 1))
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0))
  const leading = firstDay.getUTCDay()
  const totalDays = lastDay.getUTCDate()

  const cells: Array<string | null> = Array(leading).fill(null)

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(toDateKey(new Date(Date.UTC(year, monthIndex, day))))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

function formatDateText(value: string, placeholder: string) {
  if (!value) return placeholder

  return DISPLAY_DATE_FORMATTER.format(parseDateKey(value))
}

export function SingleDatePicker({
  label,
  value,
  onChange,
  placeholder = 'Pilih tanggal',
  disabled = false,
  className = ''
}: SingleDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerId = useId()
  const today = getTodayKey()

  const initialMonth = useMemo(() => {
    const source = value || today
    const date = parseDateKey(source)

    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  }, [today, value])

  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(initialMonth)
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false)

  const selectedYear = viewMonth.getUTCFullYear()
  const selectedMonth = viewMonth.getUTCMonth()

  const yearOptions = useMemo(() => {
    const years = new Set<number>()

    for (let year = CURRENT_YEAR - 10; year <= CURRENT_YEAR + 10; year += 1) {
      years.add(year)
    }

    if (value) {
      years.add(parseDateKey(value).getUTCFullYear())
    }

    years.add(selectedYear)

    return [...years].sort((a, b) => a - b)
  }, [selectedYear, value])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        rootRef.current &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false)
        setShowMonthYearPicker(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      setOpen(false)
      setShowMonthYearPicker(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleTriggerClick() {
    if (disabled) return

    if (open) {
      setOpen(false)
      setShowMonthYearPicker(false)
      return
    }

    setViewMonth(initialMonth)
    setShowMonthYearPicker(false)
    setOpen(true)
  }

  function selectDate(dateKey: string) {
    onChange(dateKey)
    setOpen(false)
    setShowMonthYearPicker(false)
  }

  return (
    <div ref={rootRef} className={`single-date-picker ${className}`.trim()}>
      <button
        id={triggerId}
        type="button"
        className="single-date-picker__trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        onClick={handleTriggerClick}
      >
        <span className="single-date-picker__label">{label}</span>

        <CalendarDays className="single-date-picker__icon" aria-hidden="true" />

        <span className="single-date-picker__value">
          {formatDateText(value, placeholder)}
        </span>

        <ChevronDown className="single-date-picker__caret" aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="single-date-picker__popover"
          role="dialog"
          aria-label={`Pilih ${label.toLowerCase()}`}
        >
          <div className="single-date-picker__toolbar">
            <button
              type="button"
              className="single-date-picker__nav"
              onClick={() => {
                setShowMonthYearPicker(false)
                setViewMonth((current) => addMonths(current, -1))
              }}
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft aria-hidden="true" />
            </button>

            <button
              type="button"
              className="single-date-picker__month-trigger"
              onClick={() => setShowMonthYearPicker((current) => !current)}
            >
              <span>{MONTH_FORMATTER.format(viewMonth)}</span>
              <ChevronDown aria-hidden="true" />
            </button>

            <button
              type="button"
              className="single-date-picker__nav"
              onClick={() => {
                setShowMonthYearPicker(false)
                setViewMonth((current) => addMonths(current, 1))
              }}
              aria-label="Bulan berikutnya"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>

          {showMonthYearPicker ? (
            <div className="single-date-picker__month-year">
              <label>
                <span>Bulan</span>

                <select
                  value={selectedMonth}
                  onChange={(event) =>
                    setViewMonth(
                      new Date(
                        Date.UTC(selectedYear, Number(event.target.value), 1)
                      )
                    )
                  }
                >
                  {MONTH_NAMES.map((month, index) => (
                    <option key={month} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Tahun</span>

                <select
                  value={selectedYear}
                  onChange={(event) =>
                    setViewMonth(
                      new Date(
                        Date.UTC(Number(event.target.value), selectedMonth, 1)
                      )
                    )
                  }
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="single-date-picker__calendar">
            <div className="single-date-picker__weekdays">
              {WEEK_DAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="single-date-picker__days">
              {getMonthCells(viewMonth).map((dateKey, index) =>
                dateKey ? (
                  <button
                    key={dateKey}
                    type="button"
                    className={[
                      'single-date-picker__day',
                      dateKey === value ? 'is-selected' : '',
                      dateKey === today ? 'is-today' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => selectDate(dateKey)}
                  >
                    {Number(dateKey.slice(-2))}
                  </button>
                ) : (
                  <span
                    key={`empty-${index}`}
                    className="single-date-picker__day single-date-picker__day--empty"
                    aria-hidden="true"
                  />
                )
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
