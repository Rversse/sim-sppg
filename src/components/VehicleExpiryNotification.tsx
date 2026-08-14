import { useEffect, useMemo, useRef, useState } from 'react'

import { getVehicles } from '@/features/vehicle/vehicle-service'
import type { Vehicle } from '@/features/vehicle/vehicle-types'

function daysUntil(value: string | null) {
  if (!value) return null
  const target = new Date(`${value}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function formatDate(value: string | null) {
  if (!value) return 'Belum diisi'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  )
}

export function VehicleExpiryNotification() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [open, setOpen] = useState(false)
  const notificationRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void getVehicles()
      .then((data) => {
        if (!cancelled) setVehicles(data)
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
          if (pkbDays !== null && pkbDays <= 30)
            items.push({
              vehicle,
              kind: 'PKB',
              date: vehicle.pkb_expiry,
              days: pkbDays
            })
          if (stnkDays !== null && stnkDays <= 30)
            items.push({
              vehicle,
              kind: 'STNK',
              date: vehicle.stnk_expiry,
              days: stnkDays
            })
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
        aria-label="Notifikasi kendaraan"
      >
        🔔
        {reminders.length > 0 && (
          <span className="vehicle-notification-badge">
            {reminders.length > 99 ? '99+' : reminders.length}
          </span>
        )}
      </button>
      {open && (
        <div className="vehicle-notification-popover">
          <div className="vehicle-notification-head">
            <strong>Notifikasi Kendaraan</strong>
            <button
              type="button"
              className="vehicle-notification-close"
              onClick={() => setOpen(false)}
              aria-label="Tutup notifikasi"
            >
              ×
            </button>
          </div>
          <div className="vehicle-notification-list">
            {reminders.length ? (
              reminders.map((item) => (
                <div
                  className="vehicle-notification-item"
                  key={`${item.kind}-${item.vehicle.id}`}
                >
                  <strong
                    className={
                      item.days <= 7
                        ? 'vehicle-notification-danger'
                        : 'vehicle-notification-warning'
                    }
                  >
                    {item.kind}{' '}
                    {item.days < 0
                      ? `terlambat ${Math.abs(item.days)} hari`
                      : `jatuh tempo ${item.days} hari lagi`}
                  </strong>
                  <div>
                    {item.vehicle.vehicle_name || item.vehicle.plate_number} •{' '}
                    {item.vehicle.plate_number}
                  </div>
                  <div>
                    {item.vehicle.kitchen?.name || 'Dapur tidak diketahui'} •{' '}
                    {formatDate(item.date)}
                  </div>
                </div>
              ))
            ) : (
              <div className="vehicle-notification-empty">
                Tidak ada kendaraan yang perlu diperhatikan.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
