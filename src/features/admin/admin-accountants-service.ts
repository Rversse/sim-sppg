import { supabase } from '@/lib/supabase'
import type {
  AccountantAssignmentHistoryRecord,
  AccountantFormInput,
  AccountantRecord
} from './admin-accountants-types'

type AdminAction =
  | 'list'
  | 'create'
  | 'update'
  | 'set_password'
  | 'deactivate'
  | 'delete'

type AdminResponse<T> = { data?: T; error?: string }

type HistoryRow = {
  id: string
  user_id: string
  kitchen_id: string
  kitchen_name: string
  accountant_name: string
  accountant_email: string
  operational_account_id: string | null
  operational_account_name: string | null
  operational_bank: string | null
  operational_account_number: string | null
  assigned_at: string
  ended_at: string | null
  end_reason: string | null
}

function mapHistory(row: HistoryRow): AccountantAssignmentHistoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    kitchenId: row.kitchen_id,
    kitchenName: row.kitchen_name,
    accountantName: row.accountant_name,
    accountantEmail: row.accountant_email,
    operationalAccount:
      row.operational_account_id ||
      row.operational_account_name ||
      row.operational_bank ||
      row.operational_account_number
        ? {
            id: row.operational_account_id,
            name: row.operational_account_name,
            bank: row.operational_bank,
            accountNumber: row.operational_account_number
          }
        : null,
    assignedAt: row.assigned_at,
    endedAt: row.ended_at,
    endReason: row.end_reason
  }
}

async function invoke<T>(
  action: AdminAction,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<AdminResponse<T>>(
    'admin-accountants',
    {
      body: { action, ...payload }
    }
  )
  if (error) throw error
  if (!data || data.error)
    throw new Error(data?.error ?? 'Operasi manajemen akuntan gagal.')
  return data.data as T
}

export async function getAccountants(): Promise<AccountantRecord[]> {
  const accountants = await invoke<AccountantRecord[]>('list')

  const { data, error } = await supabase
    .from('accountant_assignment_history')
    .select(
      'id,user_id,kitchen_id,kitchen_name,accountant_name,accountant_email,operational_account_id,operational_account_name,operational_bank,operational_account_number,assigned_at,ended_at,end_reason'
    )
    .order('assigned_at', { ascending: false })

  if (error) throw error

  const historyByUser = new Map<string, AccountantAssignmentHistoryRecord[]>()

  for (const row of (data ?? []) as HistoryRow[]) {
    const mapped = mapHistory(row)
    const current = historyByUser.get(mapped.userId) ?? []
    current.push(mapped)
    historyByUser.set(mapped.userId, current)
  }

  return accountants.map((accountant) => {
    const userHistory = historyByUser.get(accountant.id) ?? []
    return {
      ...accountant,
      lastAssignment: accountant.active ? null : (userHistory[0] ?? null),
      historyCount: userHistory.length,
      kitchenId:
        accountant.kitchenId ??
        (!accountant.active ? (userHistory[0]?.kitchenId ?? null) : null),
      kitchenName:
        accountant.kitchenName ??
        (!accountant.active ? (userHistory[0]?.kitchenName ?? null) : null),
      operationalAccount:
        accountant.operationalAccount ??
        (!accountant.active && userHistory[0]?.operationalAccount
          ? {
              id: userHistory[0].operationalAccount.id ?? '',
              name: userHistory[0].operationalAccount.name ?? '',
              bank: userHistory[0].operationalAccount.bank ?? '',
              accountNumber: userHistory[0].operationalAccount.accountNumber
            }
          : null)
    }
  })
}

export async function getAccountantHistory(userId: string) {
  const { data, error } = await supabase
    .from('accountant_assignment_history')
    .select(
      'id,user_id,kitchen_id,kitchen_name,accountant_name,accountant_email,operational_account_id,operational_account_name,operational_bank,operational_account_number,assigned_at,ended_at,end_reason'
    )
    .eq('user_id', userId)
    .order('assigned_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as HistoryRow[]).map(mapHistory)
}

export function createAccountant(input: AccountantFormInput) {
  return invoke<AccountantRecord>('create', { input })
}

export function updateAccountant(
  userId: string,
  input: Omit<AccountantFormInput, 'password'>
) {
  return invoke<AccountantRecord>('update', { userId, input })
}

export async function setAccountantPassword(userId: string, password: string) {
  await invoke<null>('set_password', { userId, password })
}

export async function deactivateAccountant(userId: string) {
  await invoke<null>('deactivate', { userId })
}

export async function deleteAccountant(userId: string) {
  await invoke<null>('delete', { userId })
}
