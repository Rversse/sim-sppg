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
  'kertajadi',
  'cipetir',
  'cihaur'
])

function normalizeKitchenName(name: string | null | undefined): string {
  return name?.trim().toLowerCase() ?? ''
}

export function getAvailableOperationalTypes(
  kitchenName: string | null | undefined
): EditableOperationalType[] {
  const normalizedName = normalizeKitchenName(kitchenName)

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
  type: OperationalType | null | undefined
): boolean {
  if (!type) return false

  const normalizedType =
    type === 'school_pic_incentive' || type === 'kader_incentive'
      ? 'pic_incentive'
      : type

  return getAvailableOperationalTypes(kitchenName).includes(normalizedType)
}
