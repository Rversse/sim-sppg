export type KoperasiOpsRealKitchen = {
  id: string
  name: string
}

export type KoperasiOpsRealInputRow = {
  line_number: number
  kitchen_id: string
  kitchen_name: string
  amount: number
  source_type: 'umum' | 'cianjur' | 'cidaun'
  note: string
}

const SPECIAL_KITCHENS = new Set(['cisepat', 'kertajadi'])

function kitchenKey(value: string) {
  return value.normalize('NFKD').trim().toLocaleLowerCase('id-ID')
}

export function buildKoperasiOpsRealRows(
  kitchens: KoperasiOpsRealKitchen[],
  amounts: Record<string, string>
): KoperasiOpsRealInputRow[] {
  const rows = kitchens.flatMap((kitchen) => {
    const special = SPECIAL_KITCHENS.has(kitchenKey(kitchen.name))
    const sources = special
      ? [
          { source_type: 'cianjur' as const, key: kitchen.id + ':cianjur', note: 'Arutala Cianjur' },
          { source_type: 'cidaun' as const, key: kitchen.id + ':cidaun', note: 'Arutala Cidaun' }
        ]
      : [{ source_type: 'umum' as const, key: kitchen.id, note: 'OPS / Real' }]

    return sources.flatMap((source) => {
      const digits = (amounts[source.key] ?? '').replace(/[^0-9]/g, '')
      const amount = digits ? Number(digits) : 0
      if (!Number.isSafeInteger(amount) || amount <= 0) return []
      return [{
        line_number: 0,
        kitchen_id: kitchen.id,
        kitchen_name: kitchen.name,
        amount,
        source_type: source.source_type,
        note: source.note
      }]
    })
  })

  return rows.map((row, index) => ({ ...row, line_number: index + 1 }))
}
