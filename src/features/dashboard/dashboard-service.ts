import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export type DashboardFlow =\n  | 'income'\n  | 'expense'\n  | 'gas'\n  | 'ops_disbursement'\n  | 'real_ops'

export type DashboardFilters = {
  startDate: string
  endDate: string
  kitchenId: string
  flowType: DashboardFlow | ''
  supplierFilter: string
}

export type DashboardSummary = {
  income: number
  expense: number
  operational: number
  realOperational: number
}

export type DashboardKitchen = {
  id: string
  name: string
  id_sppg: string | null
}

export type DashboardTransaction = {
  id: string
  transaction_date: string
  flow_type: DashboardFlow
  category: string | null
  amount: number
  note: string | null
  kitchen_id: string | null
  account_id: string | null
  supplier_id: string | null
  destination_label: string | null
  created_at: string
}

export type DashboardTransactionPage = {
  data: DashboardTransaction[]
  total: number
}

const SUPPLIER_NAMES = [
  'Koperasi Arutala',
  'Sukalarang',
  'Aris',
  'Babinsa'
] as const

export async function getDashboardSummary(
  filters: DashboardFilters,
  client: SupabaseClient = supabase
): Promise<DashboardSummary> {
  const flowTypes = filters.flowType ? [filters.flowType] : null

  const { data, error } = await client.rpc('get_dashboard_summary', {
    start_date: filters.startDate,
    end_date: filters.endDate,
    kitchen_uuid: filters.kitchenId || null,
    flow_types: flowTypes,
    supplier_filter: filters.supplierFilter || null
  })

  if (error) throw error

  const row = data?.[0] as
    | {
        income?: number
        expense?: number
        operational?: number
        real_operational?: number
      }
    | undefined

  return {
    income: Number(row?.income ?? 0),
    expense: Number(row?.expense ?? 0),
    operational: Number(row?.operational ?? 0),
    realOperational: Number(row?.real_operational ?? 0)
  }
}

export async function getActiveKitchens(
  client: SupabaseClient = supabase
): Promise<DashboardKitchen[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name,id_sppg')
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  return (data ?? []) as DashboardKitchen[]
}

async function getSupplierIdByName(
  supplierName: string,
  client: SupabaseClient
): Promise<string | null> {
  const { data, error } = await client
    .from('suppliers')
    .select('id')
    .eq('name', supplierName)
    .maybeSingle()

  if (error) throw error

  return data?.id ?? null
}

async function getSelectedKitchenName(
  kitchenId: string,
  client: SupabaseClient
): Promise<string | null> {
  const { data, error } = await client
    .from('kitchens')
    .select('name')
    .eq('id', kitchenId)
    .maybeSingle()

  if (error) throw error

  return data?.name ?? null
}

export async function getSupplierOptions(\n  filters: Pick<\n    DashboardFilters,\n    'startDate' | 'endDate' | 'kitchenId' | 'flowType'\n  >,\n  client: SupabaseClient = supabase\n): Promise<{ value: string; label: string }[]> {\n  if (filters.flowType === 'ops_disbursement') {\n    const kitchenQuery = client\n      .from('kitchens')\n      .select('id,name')\n      .eq('is_active', true)\n      .order('name')\n\n    if (filters.kitchenId) {\n      kitchenQuery.eq('id', filters.kitchenId)\n    }\n\n    const { data, error } = await kitchenQuery\n\n    if (error) throw error\n\n    return (data ?? []).map((kitchen) => ({\n      value: kitchen.id,\n      label: `Akuntan ${kitchen.name}`\n    }))\n  }\n\n  if (filters.flowType === 'gas') {\n    let query = client\n      .from('kitchen_account_rules')\n      .select(\n        `\n        account_id,\n        accounts(\n          id,\n          name,\n          bank,\n          account_number\n        )\n        `\n      )\n      .eq('flow_type', 'gas')\n\n    if (filters.kitchenId) {\n      query = query.eq('kitchen_id', filters.kitchenId)\n    }\n\n    const { data, error } = await query\n\n    if (error) throw error\n\n    const options = new Map<string, { value: string; label: string }>()\n\n    for (const row of data ?? []) {\n      const account = Array.isArray(row.accounts)\n        ? row.accounts[0]\n        : row.accounts\n\n      if (!account) continue\n\n      options.set(account.id, {\n        value: account.id,\n        label: \`${account.name} (${account.bank}${account.account_number ? ` - ${account.account_number}` : ''})\`\n      })\n    }\n\n    return [...options.values()]\n  }\n\n  if (filters.flowType === 'expense') {\n    const kitchenName = filters.kitchenId\n      ? await getSelectedKitchenName(filters.kitchenId, client)\n      : null\n\n    const isSukaraja = kitchenName?.includes('Sukaraja') ?? false\n    const names =\n      isSukaraja || !filters.kitchenId ? SUPPLIER_NAMES : ['Koperasi Arutala']\n\n    return names.map((name) => ({ value: name, label: name }))\n  }\n\n  const query = client\n    .from('kitchen_account_rules')\n    .select(\n      `\n      kitchen_id,\n      flow_type,\n      accounts!inner(\n        id,\n        name,\n        bank,\n        account_category,\n        income_suppliers!inner(\n          business_name,\n          owner_name\n        )\n      )\n      `\n    )\n    .eq('flow_type', 'income')\n\n  if (filters.kitchenId) {\n    query.eq('kitchen_id', filters.kitchenId)\n  }\n\n  const { data, error } = await query\n\n  if (error) throw error\n\n  const accounts = new Map<string, { name: string; bank: string }>()\n\n  for (const row of data ?? []) {\n    const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts\n\n    if (!account || account.account_category !== 'supplier') continue\n\n    const supplier = Array.isArray(account.income_suppliers)\n      ? account.income_suppliers[0]\n      : account.income_suppliers\n\n    if (!supplier) continue\n\n    accounts.set(account.id, {\n      name: account.name,\n      bank: account.bank\n    })\n  }\n\n  return [...accounts.entries()]\n    .map(([value, account]) => ({\n      value,\n      label: `${account.name} - ${account.bank}`\n    }))\n    .sort((a, b) => a.label.localeCompare(b.label))\n}\n
