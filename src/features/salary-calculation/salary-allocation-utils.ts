export type SalaryRoleKey =
  | 'accountant'
  | 'nutritionist'
  | 'aslap'
  | 'head'

export type SalaryAllocation = Record<SalaryRoleKey, number>

const SALARY_ROLE_KEYS: SalaryRoleKey[] = [
  'accountant',
  'nutritionist',
  'aslap',
  'head'
]

export function adjustSalaryAllocation(
  current: SalaryAllocation,
  editedKey: SalaryRoleKey,
  requestedValue: number
): SalaryAllocation {
  const editedCents = Math.min(10000, Math.max(0, Math.round(requestedValue * 100)))
  const remainingCents = 10000 - editedCents
  const otherKeys = SALARY_ROLE_KEYS.filter((key) => key !== editedKey)
  const weights = otherKeys.map((key) => Math.max(0, Math.round(current[key] * 100)))
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)

  const shares = otherKeys.map((key, index) => {
    const exact = weightTotal > 0
      ? (remainingCents * weights[index]) / weightTotal
      : remainingCents / otherKeys.length
    return { key, cents: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })

  let centsLeft = remainingCents - shares.reduce((sum, share) => sum + share.cents, 0)
  shares.sort((a, b) => b.remainder - a.remainder || SALARY_ROLE_KEYS.indexOf(a.key) - SALARY_ROLE_KEYS.indexOf(b.key))
  for (let index = 0; index < shares.length && centsLeft > 0; index += 1, centsLeft -= 1) {
    shares[index].cents += 1
  }

  const result = { ...current, [editedKey]: editedCents / 100 }
  for (const share of shares) result[share.key] = share.cents / 100
  return result
}

export function validateSalaryAllocation(
  allocation: SalaryAllocation
): string | null {
  const values = Object.values(allocation)

  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
    return 'Setiap persentase harus berada di antara 0 dan 100.'
  }

  if (values.some((value) => Math.abs(value * 100 - Math.round(value * 100)) > 1e-7)) {
    return 'Persentase maksimal menggunakan dua angka desimal.'
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  if (Math.round(total * 100) !== 10000) {
    return 'Total persentase pembagian harus tepat 100%.'
  }

  return null
}
