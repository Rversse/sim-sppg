import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

export type DateRangeValue = {
  startDate: string
  endDate: string
}

type DateRangePickerProps = {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

const WEEK_DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

const MONTH_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric'
})

const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
})

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

function compareDateKeys(a: string, b: string) {
  return a.localeCompare(b)
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

function formatRangeText(value: DateRangeValue, placeholder: string) {
  if (!value.startDate) {
    return placeholder
  }

  const start = DISPLAY_DATE_FORMATTER.format(parseDateKey(value.startDate))

  if (!value.endDate || value.endDate === value.startDate) {
    return start
  }

  const end = DISPLAY_DATE_FORMATTER.format(parseDateKey(value.endDate))

  return `${start} – ${end}`
}

function CalendarMonth({
  month,
  startDate,
  endDate,
  pendingStart,
  hoverDate,
  onHoverDate,
  onSelectDate
}: {
  month: Date
  startDate: string
  endDate: string
  pendingStart: string
  hoverDate: string
  onHoverDate: (value: string) => void
  onSelectDate: (value: string) => void
}) {
  const cells = getMonthCells(month)

  return (
    <div className="date-range-calendar-month">
      <div className="date-range-month-title">
        {MONTH_FORMATTER.format(month)}
      </div>

      <div className="date-range-weekdays">
        {WEEK_DAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="date-range-days">
        {cells.map((dateKey, index) => {
          if (!dateKey) {
            return (
              <span
                className="date-range-day date-range-day-empty"
                key={`empty-${index}`}
              />
            )
          }

          const isStart = dateKey === (pendingStart || startDate)
          const isEnd = !pendingStart && Boolean(endDate) && dateKey === endDate

          const rangeStart = pendingStart || startDate
          const rangeEnd = pendingStart
            ? hoverDate && compareDateKeys(hoverDate, pendingStart) >= 0
              ? hoverDate
              : pendingStart
            : endDate

          const inRange =
            Boolean(rangeStart) &&
            Boolean(rangeEnd) &&
            compareDateKeys(dateKey, rangeStart) >= 0 &&
            compareDateKeys(dateKey, rangeEnd) <= 0

          const beforePending =
            Boolean(pendingStart) && compareDateKeys(dateKey, pendingStart) < 0

          return (
            <button
              key={dateKey}
              type="button"
              className={[
                'date-range-day',
                isStart ? 'is-start' : '',
                isEnd ? 'is-end' : '',
                inRange ? 'is-range' : '',
                beforePending ? 'is-disabled' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={beforePending}
              onMouseEnter={() => onHoverDate(dateKey)}
              onFocus={() => onHoverDate(dateKey)}
              onClick={() => onSelectDate(dateKey)}
            >
              {Number(dateKey.slice(-2))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangePicker({
  value,
  onChange,
  className = '',
  placeholder = 'Pilih periode',
  disabled = false
}: DateRangePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const today = getTodayKey()

  const initialMonth = useMemo(() => {
    const date = value.startDate
      ? parseDateKey(value.startDate)
      : parseDateKey(today)

    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  }, [today, value.startDate])

  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(initialMonth)
  const [pendingStart, setPendingStart] = useState('')
  const [hoverDate, setHoverDate] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        rootRef.current &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false)
        setPendingStart('')
        setHoverDate('')
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      setOpen(false)
      setPendingStart('')
      setHoverDate('')
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleTriggerClick() {
    if (disabled) {
      return
    }

    if (open) {
      setOpen(false)
      setPendingStart('')
      setHoverDate('')
      return
    }

    setViewMonth(initialMonth)
    setPendingStart('')
    setHoverDate('')
    setOpen(true)
  }

  function selectDate(dateKey: string) {
    if (!pendingStart) {
      setPendingStart(dateKey)
      setHoverDate(dateKey)
      return
    }

    if (compareDateKeys(dateKey, pendingStart) < 0) {
      return
    }

    onChange({
      startDate: pendingStart,
      endDate: dateKey
    })

    setOpen(false)
    setPendingStart('')
    setHoverDate('')
  }

  const nextMonth = addMonths(viewMonth, 1)

  return (
    <div ref={rootRef} className={`date-range-picker ${className}`.trim()}>
      <button
        type="button"
        className="date-range-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={handleTriggerClick}
      >
        <CalendarDays aria-hidden="true" />

        <span className="date-range-trigger-text">
          {formatRangeText(value, placeholder)}
        </span>

        <span className="date-range-trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="date-range-popover"
          role="dialog"
          aria-label="Pilih periode"
        >
          <div className="date-range-popover-toolbar">
            <button
              type="button"
              className="date-range-nav"
              onClick={() => setViewMonth((current) => addMonths(current, -1))}
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft aria-hidden="true" />
            </button>

            <div>
              <strong>{MONTH_FORMATTER.format(viewMonth)}</strong>
              <span>
                {pendingStart ? 'Pilih tanggal akhir' : 'Pilih tanggal mulai'}
              </span>
            </div>

            <button
              type="button"
              className="date-range-nav"
              onClick={() => setViewMonth((current) => addMonths(current, 1))}
              aria-label="Bulan berikutnya"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>

          <div className="date-range-calendars">
            <CalendarMonth
              month={viewMonth}
              startDate={value.startDate}
              endDate={value.endDate}
              pendingStart={pendingStart}
              hoverDate={hoverDate}
              onHoverDate={setHoverDate}
              onSelectDate={selectDate}
            />

            <CalendarMonth
              month={nextMonth}
              startDate={value.startDate}
              endDate={value.endDate}
              pendingStart={pendingStart}
              hoverDate={hoverDate}
              onHoverDate={setHoverDate}
              onSelectDate={selectDate}
            />
          </div>

          <div className="date-range-popover-footer">
            <span>
              {pendingStart
                ? 'Pilih tanggal akhir'
                : value.startDate === value.endDate
                  ? 'Klik tanggal dua kali untuk satu hari'
                  : 'Pilih rentang tanggal'}
            </span>

            {pendingStart ? (
              <button
                type="button"
                className="date-range-reset-pending"
                onClick={() => {
                  setPendingStart('')
                  setHoverDate('')
                }}
              >
                Batal pilih
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
