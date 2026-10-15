import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2, X } from 'lucide-react'

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

type MappingGroup = {
  id: string
  title: string
  types: Array<Exclude<RuleType, 'vehicle_rent'>>
}

const RULE_GROUPS: MappingGroup[] = [
  { id: 'ops_harian', title: 'OPS / Pencairan', types: ['ops_harian'] },
  { id: 'sppg_rent', title: 'Sewa SPPG', types: ['sppg_rent'] },
  { id: 'gaji_relawan', title: 'Gaji Relawan', types: ['gaji_relawan'] },
  {
    id: 'pic_incentive',
    title: 'Insentif PIC',
    types: ['pic_incentive_school', 'pic_incentive_posyandu']
  }
]

const RULE_TYPE_LABELS: Record<Exclude<RuleType, 'vehicle_rent'>, string> = {
  ops_harian: 'OPS / Pencairan',
  sppg_rent: 'Sewa SPPG',
  gaji_relawan: 'Gaji Relawan',
  pic_incentive_school: 'Insentif PIC Sekolah',
  pic_incentive_posyandu: 'Insentif Kader Posyandu'
}

const ADDABLE_RULE_TYPES: Array<Exclude<RuleType, 'vehicle_rent'>> = [
  'ops_harian',
  'sppg_rent',
  'gaji_relawan',
  'pic_incentive_school',
  'pic_incentive_posyandu'
]

const ROLE_OPTIONS: Array<{ value: DestinationRole; label: string }> = [
  { value: '', label: 'Belum ditentukan' },
  { value: 'aslap', label: 'Rekening Aslap' },
  { value: 'akuntan', label: 'Rekening Akuntan' },
  { value: 'pic_yayasan', label: 'Rekening PIC Yayasan' },
  { value: 'berkah_mandiri_putra', label: 'Berkah Mandiri Putra' }
]

const STATUS_OPTIONS: Array<{ value: MappingStatus; label: string }> = [
  { value: 'active', label: 'Masuk' },
  { value: 'excluded', label: 'Diblokir' }
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
  type: Exclude<RuleType, 'vehicle_rent'>
  title: string
  rule: OperationalRule | null
  onSaved: () => Promise<void>
  onRemoved: () => Promise<void>
}) {
  const { success, error: toastError } = useToast()
  const [draft, setDraft] = useState<MappingDraft>(() => createDraft(rule))
  const [saving, setSaving] = useState(false)
  const permitted = draft.status === 'active'

  async function save() {
    const ownerName = draft.ownerName.trim()
    const bank = draft.bank.trim().replace(/\s+/g, ' ').toUpperCase()
    const accountNumber = draft.accountNumber.replace(/\s+/g, '')

    if (!ownerName || !bank || !accountNumber) {
      toastError('Mapping belum lengkap', 'Isi nama penerima, bank, dan nomor rekening.')
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
        target_role: draft.targetRole || null,
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
      toastError(
        'Gagal menyimpan mapping',
        error instanceof Error ? error.message : 'Periksa data rekening lalu coba lagi.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!rule) return
    if (!window.confirm('Hapus mapping ' + title + ' untuk ' + kitchenName + '? Transaksi terkait akan tertahan sampai mapping diatur lagi.')) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('kitchen_operational_account_rules')
        .delete()
        .eq('id', rule.id)
      if (error) throw error

      success('Mapping dihapus', title + ' untuk ' + kitchenName + ' sekarang belum diatur.')
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
          <span
            className={'disbursement-status-dot ' + (permitted ? 'is-allowed' : 'is-blocked')}
            title={permitted ? 'Masuk ke database diperbolehkan' : 'Diblokir dari database'}
            aria-label={permitted ? 'Masuk ke database diperbolehkan' : 'Diblokir dari database'}
            role="img"
          />
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
        <label>
          <span>Tujuan Rekening</span>
          <select
            value={draft.targetRole}
            onChange={(event) => setDraft((current) => ({ ...current, targetRole: event.target.value as DestinationRole }))}
            disabled={saving}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value || 'unspecified'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="disbursement-mapping-status-field">
          <span>Input ke Database</span>
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
  const [addMappingOpen, setAddMappingOpen] = useState(false)
  const [addingKitchenId, setAddingKitchenId] = useState('')
  const [addingRuleType, setAddingRuleType] = useState<Exclude<RuleType, 'vehicle_rent'> | ''>('')

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
      setError(error instanceof Error ? error.message : 'Gagal memuat Data Rekening.')
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

  const addingKitchen = kitchens.find((kitchen) => kitchen.id === addingKitchenId)
  const availableAddTypes = ADDABLE_RULE_TYPES.filter((type) =>
    !rules.some((rule) => rule.kitchen_id === addingKitchenId && rule.rule_type === type)
  )

  if (!canView) return <div className="app-access-denied">Akses ditolak.</div>

  return (
    <main className="disbursement-accounts-page">
      <section className="disbursement-toolbar-grid" aria-label="Pengaturan dapur">
        <label className="disbursement-kitchen-picker">
          <span>DAPUR</span>
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
        <div className="disbursement-status-field">
          <span>STATUS DAPUR</span>
          {selectedKitchen ? (
            <div className="disbursement-status-control">
              <span
                className={'disbursement-status-dot ' + (selectedKitchen.is_active ? 'is-allowed' : 'is-blocked')}
                aria-hidden="true"
              />
              <strong>{selectedKitchen.is_active ? 'Aktif' : 'Nonaktif'}</strong>
            </div>
          ) : (
            <div className="disbursement-status-control is-empty">—</div>
          )}
        </div>
        <button
          type="button"
          className="app-action-button app-action-button--secondary disbursement-add-mapping-button"
          onClick={() => {
            const nextOpen = !addMappingOpen
            setAddMappingOpen(nextOpen)
            setAddingKitchenId(selectedKitchenId)
            setAddingRuleType('')
          }}
          disabled={loading || kitchens.length === 0}
        >
          {addMappingOpen ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          <span>{addMappingOpen ? 'Tutup' : 'Tambah Mapping'}</span>
        </button>
      </section>

      {error ? <div className="disbursement-page-error">{error}</div> : null}

      {addMappingOpen && !loading ? (
        <section className="disbursement-add-panel">
          <header className="disbursement-add-panel-header">
            <h2>Tambah Mapping</h2>
            <p>Pilih dapur dan jenis mapping yang belum diatur.</p>
          </header>
          <div className="disbursement-add-form-fields">
            <label>
              <span>DAPUR</span>
              <select
                value={addingKitchenId}
                onChange={(event) => {
                  setAddingKitchenId(event.target.value)
                  setAddingRuleType('')
                }}
              >
                {kitchens.map((kitchen) => (
                  <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>JENIS MAPPING</span>
              <select
                value={addingRuleType}
                onChange={(event) => setAddingRuleType(event.target.value as Exclude<RuleType, 'vehicle_rent'> | '')}
              >
                <option value="">Pilih jenis mapping</option>
                {ADDABLE_RULE_TYPES.map((type) => {
                  const exists = rules.some((rule) => rule.kitchen_id === addingKitchenId && rule.rule_type === type)
                  return (
                    <option key={type} value={type} disabled={exists}>
                      {RULE_TYPE_LABELS[type]}{exists ? ' — sudah ada' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
          </div>
          {addingRuleType && addingKitchen ? (
            <MappingEditor
              key={addingKitchenId + '-' + addingRuleType + '-new'}
              kitchenName={addingKitchen.name}
              kitchenId={addingKitchen.id}
              type={addingRuleType}
              title={RULE_TYPE_LABELS[addingRuleType]}
              rule={null}
              onSaved={async () => {
                setAddMappingOpen(false)
                setAddingRuleType('')
                await load()
              }}
              onRemoved={load}
            />
          ) : (
            <p className="disbursement-add-hint">
              {availableAddTypes.length
                ? 'Pilih jenis mapping di atas untuk mengisi rekening tujuannya.'
                : 'Semua jenis mapping untuk dapur ini sudah terisi.'}
            </p>
          )}
        </section>
      ) : null}

      {loading ? (
        <div className="disbursement-empty-state">Memuat konfigurasi rekening…</div>
      ) : !selectedKitchen ? (
        <div className="disbursement-empty-state">Belum ada data dapur.</div>
      ) : (
        <>




          <div className="disbursement-accounts-intro">
            <h2>Mapping untuk {selectedKitchen.name}</h2>
          </div>

          <div className="disbursement-mapping-groups">
            <section className="disbursement-mapping-group disbursement-vehicle-group">
              <header>
                <h3>SEWA KENDARAAN</h3>
              </header>
              {vehicleReference ? (
                <div className="disbursement-fixed-account">
                  <strong>{vehicleReference.owner_name}</strong>
                  <span>{vehicleReference.bank} · {vehicleReference.account_number}</span>
                  {!vehicleConsistent ? (
                    <small className="is-warning">Rekening Sewa Kendaraan berbeda antar-dapur. Samakan sebelum digunakan.</small>
                  ) : null}
                </div>
              ) : (
                <div className="disbursement-page-error">Mapping rekening Sewa Kendaraan belum tersedia.</div>
              )}
            </section>
            {RULE_GROUPS.map((group) => (
              <section className={`disbursement-mapping-group disbursement-group-${group.id}`} key={group.id}>
                <header>
                  <h3>{group.title}</h3>
                </header>

                {group.types.map((type) => {
                  const typeRules = selectedRules.filter((rule) => rule.rule_type === type)
                  if (!typeRules.length) {
                    return (
                      <div className="disbursement-unconfigured" key={type}>
                        <strong>{RULE_TYPE_LABELS[type]}</strong>
                        <span>Belum ada mapping. Tambahkan lewat tombol di atas.</span>
                      </div>
                    )
                  }

                  return typeRules.map((rule) => (
                    <MappingEditor
                      key={[rule.id, rule.owner_name, rule.bank, rule.account_number, rule.mapping_status, rule.target_role ?? ''].join(':')}
                      kitchenName={selectedKitchen.name}
                      kitchenId={selectedKitchen.id}
                      type={type}
                      title={RULE_TYPE_LABELS[type]}
                      rule={rule}
                      onSaved={load}
                      onRemoved={load}
                    />
                  ))
                })}
              </section>
            ))}
          </div>

          <p className="disbursement-accounts-footnote">
            Untuk transaksi Lain-lain, cek dulu sebelum dimasukkan ke database. Jenis pencairan lainnya mengikuti mapping di atas. Kalau mapping belum lengkap atau disetel Diblokir, transaksi akan tertahan.
          </p>
        </>
      )}
    </main>
  )
}
