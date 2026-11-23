export type KoperasiOpsRealKitchen = {
  id: string
  name: string
}

export type KoperasiOpsRealInputRow = {
  line_number: number
  kitchen_id: string
  kitchen_name: string
  amount: number
}

export function buildKoperasiOpsRealRows(
  kitchens: KoperasiOpsRealKitchen[],
  amounts: Record<string, string>
): KoperasiOpsRealInputRow[] {
  return kitchens.flatMap((kitchen) => {
    const digits = (amounts[kitchen.id] ?? '').replace(/[^0-9]/g, '')
    const amount = digits ? Number(digits) : 0
    if (!Number.isSafeInteger(amount) || amount <= 0) return []
    return [{
      line_number: 0,
      kitchen_id: kitchen.id,
      kitchen_name: kitchen.name,
      amount
    }]
  }).map((row, index) => ({ ...row, line_number: index + 1 }))
}
