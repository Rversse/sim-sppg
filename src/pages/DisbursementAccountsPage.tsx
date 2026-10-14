import { useCallback, useEffect, useMemo, useState } from 'react'
import { Landmark, Save, Trash2 } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { canAccess } from '@/features/auth/role-policy'
import { useAuth } from '@/features/auth/use-auth'
import { useToast } from '@/features/ui/toast-context'

type KitchenRef = {
  id: string
  name: string
  is_active: boolean
}

type RuleType =
  | 'ops_harian'
  | 'sppg_rent'
  | 'gaji_relawan'
  | 'pic_incentive_school'
  | 'pic_incentive_posyandu'
  | 'vehicle_rent'

type MappingStatus = 'active' | 'excluded'
type DestinationRole =
  | 'aslap'
  | 'akuntan'
  | 'pic_yayasan'
  | 'berkah_mandiri_putra'
  | 'supplier'
  | 'other'
  | ''

type OperationalRule = {
  id: string
  kitchen_id: string
  rule_type: RuleType
  owner_name: string
  bank: string
  account_number: string
  is_active: boolean
  mapping_status: MappingStatus
  target_role: DestinationRole | null
}

type MappingDraft = {
  ownerName: string
  bank: string
  accountNumber: string
  status: MappingStatus
  targetRole: DestinationRole
}

const RULE_GROUPS: Array<{
  type: Exclude<RuleType, 'vehicle_rent'>
  title: string
  description: string
}> = [
  {
    type: 'ops_harian',
    title: 'OPS / Pencairan',
    description: 'Tujuan rekening operasional harian ke Aslap, Akuntan, atau rekening lain yang ditetapkan.'
  },
  {
    type: 'sppg_rent',
    title: 'Sewa SPPG',
    description: 'Rekening penerima untuk pencairan Sewa SPPG.'
  },
  {
    type: 'gaji_relawan',
    title: 'Gaji Relawan',
    description: 'Rekening penerima gaji relawan dari output Maker.'
  },
  {
    type: 'pic_incentive_school',
    title: 'Insentif PIC Sekolah',
    description: 'Rekening penerima insentif PIC sekolah.'
  },
  {
    type: 'pic_incentive_posyandu',
    title: 'Insentif Kader Posyandu',
    description: 'Rekening penerima insentif kader Posyandu.'
  }
]

const ROLE_OPTIONS: Array<{ value: DestinationRole; label: string }> = [
  { value: '', label: 'Belum diklasifikasikan' },
  { value: 'aslap', label: 'Rekening Aslap' },
  { value: 'akuntan', label: 'Rekening Akuntan' },
  { value: 'pic_yayasan', label: 'Rekening PIC Yayasan' },
  { value: 'berkah_mandiri_putra', label: 'Berkah Mandiri Putra' },
  { value: 'supplier', label: 'Supplier / pihak luar' },
  { value: 'other', label: 'Lainnya' }
]

const STATUS_OPTIONS: Array<{ value: MappingStatus; label: string }> = [
  { value: 'active', label: 'Aktif — boleh diimpor' },
  { value: 'excluded', label: 'Dikecualikan — jangan masuk transaksi' }
]

function createDraft(rule: OperationalRule | null): MappingDraft {
  return {
    ownerName: rule?.owner_name ?? '',
    bank: rule?.bank ?? '',
    accountNumber: rule?.account_number ?? '',
    status: rule?.mapping_status ?? 'active',
    targetRole: rule?.target_role ?? ''
  }
}

function MappingEditor({
  kitchenName,
  kitchenId,
  type,
  title,
  rule,
  onSaved,
  onRemoved
}: {
  kitchenName: string
  kitchenId: string
  type: RuleType
  title: string
  rule: OperationalRule | null
  onSaved: () => Promise<void>
  onRemoved: () => Promise<void>
}) {
  const { success, error: toastError } = useToast()
  const [draft, setDraft] = useState<MappingDraft>(() => createDraft(rule))
  const [saving, setSaving] = useState(false)

  async function save() {
    const ownerName = draft.ownerName.trim()
    const bank = draft.bank.trim().replace(/\s+/g, ' ').toUpperCase()
    const accountNumber = draft.accountNumber.replace(/\s+/g, '')

    if (!ownerName || !bank || !accountNumber) {
      toastError('Mapping belum lengkap', 'Isi nama penerima, bank, dan nomor rekening agar konfigurasi dapat dipakai Maker-Pencairan.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        kitchen_id: kitchenId,
        rule_type: type,
        owner_name: ownerName,
        bank,
        account_number: accountNumber,
        is_active: true,
        mapping_status: draft.status,
        target_role: type === 'ops_harian' ? (draft.targetRole || null) : null,
        updated_at: new Date().toISOString()
      }

      const result = rule
        ? await supabase
            .from('kitchen_operational_account_rules')
            .update(payload)
            .eq('id', rule.id)
        : await supabase
            .from('kitchen_operational_account_rules')
            .insert(payload)

      if (result.error) throw result.error

      success('Mapping disimpan', title + ' untuk ' + kitchenName + ' berhasil disimpan.')
      await onSaved()
    } catch (error) {
      console.error(error)
      toastError('Gagal menyimpan mapping', error instanceof Error ? error.message : 'Periksa apakah rekening tersebut sudah dipetakan untuk jenis pencairan ini.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!rule) return
    if (!window.confirm('Hapus mapping ' + title + ' untuk ' + kitchenName + '? Statusnya akan menjadi Belum diatur dan impor akan ditahan.')) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('kitchen_operational_account_rules')
        .delete()
        .eq('id', rule.id)
      if (error) throw error
      success('Mapping dihapus', title + ' sekarang berstatus Belum diatur.')
      await onRemoved()
    } catch (error) {
      console.error(error)
      toastError('Gagal menghapus mapping', error instanceof Error ? error.message : 'Gagal menghapus mapping rekening.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="disbursement-mapping-row">
      <div className="disbursement-mapping-row-head">
        <div>
          <strong>{title}</strong>
          <span className={draft.status === 'active' ? 'disbursement-status is-active' : 'disbursement-status is-excluded'}>
            {draft.status === 'active' ? 'Aktif' : 'Dikecualikan'}
          </span>
        </div>
        {rule ? (
          <button
            type="button"
            className="app-action-button app-action-button--secondary app-action-button--icon"
            onClick={() => void remove()}
            disabled={saving}
            aria-label={'Hapus mapping ' + title}
            title="Hapus mapping"
          >
            <Trash2 aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="disbursement-mapping-fields">
        <label>
          <span>Nama penerima / pemilik</span>
          <input
            value={draft.ownerName}
            onChange={(event) => setDraft((current) => ({ ...current, ownerName: event.target.value }))}
            placeholder="Nama sesuai output Maker"
            disabled={saving}
          />
        </label>
        <label>
          <span>Bank</span>
          <input
            value={draft.bank}
            onChange={(event) => setDraft((current) => ({ ...current, bank: event.target.value.toUpperCase() }))}
            placeholder="Contoh: BNI"
            disabled={saving}
          />
        </label>
        <label>
          <span>Nomor rekening</span>
          <input
            value={draft.accountNumber}
            onChange={(event) => setDraft((current) => ({ ...current, accountNumber: event.target.value.replace(/\s+/g, '') }))}
            inputMode="numeric"
            placeholder="Nomor rekening"
            disabled={saving}
          />
        </label>
        {type === 'ops_harian' ? (
          <label>
            <span>Peran / tujuan rekening</span>
            <select
              value={draft.targetRole}
              onChange={(event) => setDraft((current) => ({ ...current, targetRole: event.target.value as DestinationRole }))}
              disabled={saving}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value || 'unclassified'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="disbursement-mapping-status-field">
          <span>Aturan impor SIM-SPPG</span>
          <select
            value={draft.status}
            onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as MappingStatus }))}
            disabled={saving}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="disbursement-mapping-actions">
          <button
            type="button"
            className="app-action-button"
            onClick={() => void save()}
            disabled={saving}
          >
            <Save aria-hidden="true" />
            <span>{saving ? 'Menyimpan…' : 'Simpan mapping'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export function DisbursementAccountsPage() {
  const { user } = useAuth()
  const canView = canAccess(user?.role, 'disbursement-accounts.view')
  const [kitchens, setKitchens] = useState<KitchenRef[]>([])
  const [rules, setRules] = useState<OperationalRule[]>([])
  const [selectedKitchenId, setSelectedKitchenId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [kitchenResult, ruleResult] = await Promise.all([
        supabase.from('kitchens').select('id,name,is_active').order('name'),
        supabase
          .from('kitchen_operational_account_rules')
          .select('id,kitchen_id,rule_type,owner_name,bank,account_number,is_active,mapping_status,target_role')
          .order('rule_type')
      ])

      if (kitchenResult.error) throw kitchenResult.error
      if (ruleResult.error) throw ruleResult.error

      const nextKitchens = (kitchenResult.data ?? []) as KitchenRef[]
      setKitchens(nextKitchens)
      setRules((ruleResult.data ?? []) as OperationalRule[])
      setSelectedKitchenId((current) =>
        nextKitchens.some((kitchen) => kitchen.id === current)
          ? current
          : (nextKitchens.find((kitchen) => kitchen.is_active) ?? nextKitchens[0])?.id ?? ''
      )
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Gagal memuat Data Rekening.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canView) return
    let cancelled = false

    void Promise.resolve().then(() => {
      if (!cancelled) return load()
      return undefined
    })

    return () => {
      cancelled = true
    }
  }, [canView, load])

  const selectedKitchen = kitchens.find((kitchen) => kitchen.id === selectedKitchenId)
  const selectedRules = useMemo(
    () => rules.filter((rule) => rule.kitchen_id === selectedKitchenId && rule.rule_type !== 'vehicle_rent'),
    [rules, selectedKitchenId]
  )
  const vehicleRules = useMemo(
    () => rules.filter((rule) => rule.rule_type === 'vehicle_rent' && rule.is_active),
    [rules]
  )
  const vehicleReference = vehicleRules[0] ?? null
  const vehicleConsistent = vehicleRules.every((rule) =>
    rule.owner_name === vehicleReference?.owner_name &&
    rule.bank === vehicleReference?.bank &&
    rule.account_number === vehicleReference?.account_number
  )

  if (!canView) return <div className="app-access-denied">Akses ditolak.</div>

  return (
    <main className="disbursement-accounts-page">
      <header className="disbursement-accounts-header">
        <div className="disbursement-accounts-heading">
          <span className="disbursement-accounts-heading-icon"><Landmark aria-hidden="true" /></span>
          <div>
            <h1>Data Rekening</h1>
            <p>Satu sumber mapping rekening yang dibaca Maker-Pencairan dan SIM-SPPG.</p>
          </div>
        </div>
        <label className="disbursement-kitchen-picker">
          <span>Dapur</span>
          <select
            value={selectedKitchenId}
            onChange={(event) => setSelectedKitchenId(event.target.value)}
            disabled={loading || kitchens.length === 0}
          >
            {kitchens.map((kitchen) => (
              <option key={kitchen.id} value={kitchen.id}>
                {kitchen.name}{kitchen.is_active ? '' : ' — Nonaktif'}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error ? <div className="disbursement-page-error">{error}</div> : null}

      {loading ? (
        <div className="disbursement-empty-state">Memuat konfigurasi rekening…</div>
      ) : !selectedKitchen ? (
        <div className="disbursement-empty-state">Belum ada data dapur.</div>
      ) : (
        <>
          <div className="disbursement-kitchen-status">
            <span>Status dapur</span>
            <strong className={selectedKitchen.is_active ? 'is-active' : 'is-inactive'}>
              {selectedKitchen.is_active ? 'Aktif' : 'Nonaktif'}
            </strong>
            <small>{selectedKitchen.is_active ? 'Dapur ini tersedia di Maker-Pencairan.' : 'Dapur ini tidak ditawarkan untuk transaksi baru di Maker-Pencairan.'}</small>
          </div>

          <section className="disbursement-global-card">
            <div>
              <h2>Sewa Kendaraan</h2>
              <p>Rekening tetap untuk semua dapur aktif. Tidak perlu mengatur rekening ini per dapur.</p>
            </div>
            {vehicleReference ? (
              <div className="disbursement-fixed-account">
                <strong>{vehicleReference.owner_name}</strong>
                <span>{vehicleReference.bank} · {vehicleReference.account_number}</span>
                <small>{vehicleConsistent ? 'Rekening bersama terdeteksi konsisten di mapping dapur.' : 'Perhatian: data rekening Sewa Kendaraan berbeda antar-dapur. Samakan dulu sebelum digunakan.'}</small>
              </div>
            ) : (
              <div className="disbursement-page-error">Mapping rekening Sewa Kendaraan belum tersedia.</div>
            )}
          </section>

          <div className="disbursement-accounts-intro">
            <h2>Mapping untuk {selectedKitchen.name}</h2>
            <p>Maker-Pencairan membaca rekening di sini saat membuat output. Status impor menentukan apakah baris yang sama boleh menjadi transaksi SIM-SPPG.</p>
          </div>

          <div className="disbursement-mapping-groups">
            {RULE_GROUPS.map((group) => {
              const groupRules = selectedRules.filter((rule) => rule.rule_type === group.type)
              return (
                <section className="disbursement-mapping-group" key={group.type}>
                  <header>
                    <div>
                      <h3>{group.title}</h3>
                      <p>{group.description}</p>
                    </div>

                  </header>

                  {groupRules.length === 0 ? (
                    <div className="disbursement-unconfigured">
                      <strong>Belum diatur</strong>
                      <span>Impor untuk jenis ini akan ditahan sampai rekening dikonfigurasi.</span>
                    </div>
                  ) : null}

                  {groupRules.map((rule) => (
                    <MappingEditor
                      key={[rule.id, rule.owner_name, rule.bank, rule.account_number, rule.mapping_status, rule.target_role ?? ''].join(':')}
                      kitchenName={selectedKitchen.name}
                      kitchenId={selectedKitchen.id}
                      type={group.type}
                      title={group.title}
                      rule={rule}
                      onSaved={load}
                      onRemoved={load}
                    />
                  ))}

                  {groupRules.length === 0 ? (
                    <div id={'new-' + selectedKitchen.id + '-' + group.type}>
                      <MappingEditor
                        key={selectedKitchen.id + '-' + group.type + '-new'}
                        kitchenName={selectedKitchen.name}
                        kitchenId={selectedKitchen.id}
                        type={group.type}
                        title={group.title}
                        rule={null}
                        onSaved={load}
                        onRemoved={load}
                      />
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>

          <p className="disbursement-accounts-footnote">
            Baris berstatus Dikecualikan tetap dapat dibuat oleh Maker-Pencairan agar proses pencairan berjalan, tetapi tidak boleh masuk sebagai transaksi SIM-SPPG. Mapping yang belum ada harus dilengkapi sebelum batch impor bisa disimpan.
          </p>
        </>
      )}
    </main>
  )
}
