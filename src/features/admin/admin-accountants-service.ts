import { supabase } from '@/lib/supabase'
import type {
  AccountantAssignmentHistoryRecord,
  AccountantFormInput,
  AccountantRecord
} from './admin-accountants-types'

type AdminAction =
  | 'list'
  | 'history'
  | 'create'
  | 'update'
  | 'set_password'
  | 'deactivate'
  | 'delete'

type AdminResponse<T> = { data?: T; error?: string }

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

export function getAccountants() {
  return invoke<AccountantRecord[]>('list')
}

export function getAccountantHistory(userId: string) {
  return invoke<AccountantAssignmentHistoryRecord[]>('history', { userId })
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
