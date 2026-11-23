export type ExpenseDuplicateFilter =
  | { column: 'category'; operator: 'eq'; value: string }
  | { column: 'supplier_id'; operator: 'eq'; value: string }
  | { column: 'supplier_id'; operator: 'is'; value: null }

export function getExpenseDuplicateFilters(
  category: string,
  supplierId: string | null
): ExpenseDuplicateFilter[] {
  return [
    { column: 'category', operator: 'eq', value: category },
    supplierId
      ? { column: 'supplier_id', operator: 'eq', value: supplierId }
      : { column: 'supplier_id', operator: 'is', value: null }
  ]
}
