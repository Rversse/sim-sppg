export const CIPETIR_OPERATIONAL_POLICY_START_DATE = '2026-10-12'
export const CIHAUR_OPERATIONAL_POLICY_START_DATE = '2026-10-12'

export type EditableOperationalType =
  | 'relawan_salary'
  | 'pic_incentive'
  | 'vehicle_rent'
  | 'sppg_rent'

export type OperationalType =
  | EditableOperationalType
  | 'school_pic_incentive'
  | 'kader_incentive'

export const OPERATIONAL_TYPE_OPTIONS: ReadonlyArray<{
  value: EditableOperationalType
  label: string
}> = [
  { value: 'relawan_salary', label: 'Gaji Relawan' },
  { value: 'pic_incentive', label: 'Insentif PIC' },
  { value: 'vehicle_rent', label: 'Sewa Kendaraan' },
  { value: 'sppg_rent', label: 'Sewa SPPG' }
]

const RENT_ONLY_KITCHENS = new Set([
  'campakamulya',
  'cikondang',
  'kertajadi'
])

function normalizeKitchenName(name: string | null | undefined): string {
  return name?.trim().toLowerCase() ?? ''
}

export function getAvailableOperationalTypes(
  kitchenName: string | null | undefined,
  transactionDate?: string
): EditableOperationalType[] {
  const normalizedName = normalizeKitchenName(kitchenName)

  if (normalizedName === 'cipetir') {
    if (
      transactionDate &&
      transactionDate < CIPETIR_OPERATIONAL_POLICY_START_DATE
    ) {
      return ['vehicle_rent', 'sppg_rent']
    }

    return [
      'relawan_salary',
      'pic_incentive',
      'vehicle_rent',
      'sppg_rent'
    ]
  }

  if (normalizedName === 'cihaur') {
    if (
      transactionDate &&
      transactionDate < CIHAUR_OPERATIONAL_POLICY_START_DATE
    ) {
      return ['vehicle_rent', 'sppg_rent']
    }

    return OPERATIONAL_TYPE_OPTIONS.map((option) => option.value)
  }

  if (RENT_ONLY_KITCHENS.has(normalizedName)) {
    return ['vehicle_rent', 'sppg_rent']
  }

  if (normalizedName === 'sukaraja') {
    return ['relawan_salary', 'vehicle_rent', 'sppg_rent']
  }

  return OPERATIONAL_TYPE_OPTIONS.map((option) => option.value)
}

export function isOperationalTypeAvailable(
  kitchenName: string | null | undefined,
  type: OperationalType | null | undefined,
  transactionDate?: string
): boolean {
  if (!type) return false

  const normalizedType =
    type === 'school_pic_incentive' || type === 'kader_incentive'
      ? 'pic_incentive'
      : type

  return getAvailableOperationalTypes(kitchenName, transactionDate).includes(
    normalizedType
  )
}

export function getOperationalDestinationLabel(
  kitchenName: string | null | undefined,
  type: OperationalType | null | undefined,
  transactionDate?: string
): string | null {
  if (!type) return null

  const normalizedName = normalizeKitchenName(kitchenName)
  const normalizedType =
    type === 'school_pic_incentive' || type === 'kader_incentive'
      ? 'pic_incentive'
      : type

  if (
    transactionDate &&
    (
      (normalizedName === 'cipetir' &&
        transactionDate < CIPETIR_OPERATIONAL_POLICY_START_DATE) ||
      (normalizedName === 'cihaur' &&
        transactionDate < CIHAUR_OPERATIONAL_POLICY_START_DATE)
    ) &&
    (normalizedType === 'relawan_salary' || normalizedType === 'pic_incentive')
  ) {
    return null
  }

  return normalizedType === 'vehicle_rent'
    ? 'Rekening Berkah Mandiri Putra'
    : 'Rekening PIC Yayasan'
}
