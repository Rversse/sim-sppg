import { Bell, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { getVehicles } from '@/features/vehicle/vehicle-service'
import type { Vehicle } from '@/features/vehicle/vehicle-types'

import { formatDate } from '@/lib/formatters'

function daysUntil(value: string | null) {
  if (!value) return null

  const target = new Date(`${value}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function formatVehicleDate(value: string | null) {
  if (!value) return 'Belum diisi'

  return formatDate(value)
}

export function VehicleExpiryNotification() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [open, setOpen] = useState(false)
  const notificationRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false

    void getVehicles()
      .then((data) => {
        if (!cancelled) {
          setVehicles(data)
        }
      })
      .catch((error) => console.error(error))

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (
        target instanceof Node &&
        !notificationRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const reminders = useMemo(
    () =>
      vehicles
        .flatMap((vehicle) => {
          const items: {
            vehicle: Vehicle
            kind: 'PKB' | 'STNK'
            date: string | null
            days: number
          }[] = []

          const pkbDays = daysUntil(vehicle.pkb_expiry)
          const stnkDays = daysUntil(vehicle.stnk_expiry)

          if (pkbDays !== null && pkbDays <= 30) {
            items.push({
              vehicle,
              kind: 'PKB',
              date: vehicle.pkb_expiry,
              days: pkbDays
            })
          }

          if (stnkDays !== null && stnkDays <= 30) {
            items.push({
              vehicle,
              kind: 'STNK',
              date: vehicle.stnk_expiry,
              days: stnkDays
            })
          }

          return items
        })
        .sort((a, b) => a.days - b.days),
    [vehicles]
  )

  return (
    <div ref={notificationRef} className="vehicle-notification">
      <button
        type="button"
        className="vehicle-notification-button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifikasi Kendaraan"
        aria-expanded={open}
        title="Notifikasi Kendaraan"
      >
        <Bell aria-hidden="true" />

        {reminders.length > 0 ? (
          <span className="vehicle-notification-badge">
            {reminders.length > 99 ? '99+' : reminders.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="vehicle-notification-popover"
          role="dialog"
          aria-label="Notifikasi Kendaraan"
        >
          <div className="vehicle-notification-head">
            <strong>Notifikasi Kendaraan</strong>

            <button
              type="button"
              className="vehicle-notification-close"
              onClick={() => setOpen(false)}
              aria-label="Tutup notifikasi"
            >
              <X aria-hidden="true" />
            </button>
          </div>

          <div className="vehicle-notification-list">
            {reminders.length ? (
              reminders.map((item) => {
                const severityClass =
                  item.days <= 7 ? 'is-danger' : 'is-warning'

                return (
                  <div
                    className={`vehicle-notification-item ${severityClass}`}
                    key={`${item.kind}-${item.vehicle.id}`}
                  >
                    <div className="vehicle-notification-item-top">
                      <strong>{item.kind}</strong>

                      <span>
                        {item.days < 0
                          ? `Terlambat ${Math.abs(item.days)} hari`
                          : `${item.days} hari lagi`}
                      </span>
                    </div>

                    <div className="vehicle-notification-name">
                      {item.vehicle.vehicle_name || item.vehicle.plate_number}
                    </div>

                    <div>
                      {item.vehicle.plate_number} •{' '}
                      {item.vehicle.kitchen?.name || 'Dapur tidak diketahui'}
                    </div>

                    <div>{formatVehicleDate(item.date)}</div>
                  </div>
                )
              })
            ) : (
              <div className="vehicle-notification-empty">
                Tidak ada kendaraan yang perlu diperhatikan.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
