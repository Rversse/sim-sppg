import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type { AccountInput, Supplier, SupplierInput } from './supplier-types'

type ProfileRow = { id: string; username: string | null }

async function getProfileNames(ids: string[], client: SupabaseClient) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]

  if (!uniqueIds.length) {
    return new Map<string, string>()
  }

  const { data, error } = await client
    .from('profiles')
    .select('id,username')
    .in('id', uniqueIds)

  if (error) throw error

  return new Map(
    ((data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile.username ?? profile.id
    ])
  )
}

export async function getSuppliers(
  client: SupabaseClient = supabase
): Promise<Supplier[]> {
  const { data, error } = await client
    .from('income_suppliers')
    .select(
      `
      id,
      business_name,
      created_at,
      created_by,
      updated_at,
      updated_by,
      owner_name,
      product_type,
      phone,
      address,
      accounts (
        id,
        supplier_id,
        name,
        bank,
        account_number,
        opening_balance,
        created_at,
        updated_at,
        created_by,
        updated_by,
        kitchen_account_rules (
          kitchen_id,
          kitchens ( name )
        )
      )
    `
    )
    .order('business_name')

  if (error) throw error

  const suppliers = (data ?? []) as unknown as Supplier[]

  const names = await getProfileNames(
    suppliers.flatMap((supplier) => [
      supplier.created_by ?? '',
      supplier.updated_by ?? ''
    ]),
    client
  )

  return suppliers.map((supplier) => ({
    ...supplier,
    created_by_name: supplier.created_by
      ? (names.get(supplier.created_by) ?? supplier.created_by)
      : null,
    updated_by_name: supplier.updated_by
      ? (names.get(supplier.updated_by) ?? supplier.updated_by)
      : null
  }))
}

export async function createSupplier(
  input: SupplierInput,
  client: SupabaseClient = supabase
): Promise<void> {
  validateSupplierInput(input)

  const { error } = await client
    .from('income_suppliers')
    .insert(toSupplierRecord(input))

  if (error) throw error
}

export async function updateSupplier(
  id: string,
  input: SupplierInput,
  client: SupabaseClient = supabase
): Promise<void> {
  if (!id) throw new Error('ID supplier tidak ditemukan.')

  validateSupplierInput(input)

  const businessName = normalizeBusinessName(input.business_name)

  const { error } = await client
    .from('income_suppliers')
    .update({
      ...toSupplierRecord(input),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  if (error) throw error

  const { error: accountError } = await client
    .from('accounts')
    .update({ name: businessName })
    .eq('supplier_id', id)

  if (accountError) {
    throw new Error(
      'Supplier berhasil diperbarui, tetapi sinkronisasi nama rekening gagal.'
    )
  }
}

export async function deleteSupplier(
  id: string,
  client: SupabaseClient = supabase
): Promise<void> {
  const supplier = await getSupplier(id, client)

  if (!supplier) throw new Error('Supplier tidak ditemukan.')

  if (supplier.accounts.length > 0) {
    throw new Error(
      `Supplier masih memiliki ${supplier.accounts.length} rekening. Hapus seluruh rekening terlebih dahulu.`
    )
  }

  const { error } = await client.from('income_suppliers').delete().eq('id', id)

  if (error) throw error
}

export async function saveSupplierAccount(
  supplierId: string,
  accountId: string | null,
  input: AccountInput,
  client: SupabaseClient = supabase
): Promise<void> {
  validateAccountInput(input)

  const supplier = await getSupplier(supplierId, client)

  if (!supplier) throw new Error('Supplier tidak ditemukan.')

  const accountNumber = input.account_number.trim()

  const duplicate = supplier.accounts.find(
    (account) =>
      account.id !== accountId &&
      account.bank === input.bank &&
      (account.account_number ?? '') === accountNumber
  )

  if (duplicate) {
    throw new Error('Rekening dengan bank dan nomor tersebut sudah ada.')
  }

  if (accountId) {
    const { error } = await client
      .from('accounts')
      .update({
        bank: input.bank,
        account_number: accountNumber,
        opening_balance: input.opening_balance
      })
      .eq('id', accountId)

    if (error) throw error

    return
  }

  const { error } = await client.from('accounts').insert({
    supplier_id: supplierId,
    name: supplier.business_name,
    bank: input.bank,
    account_number: accountNumber,
    opening_balance: input.opening_balance
  })

  if (error) throw error
}

export async function deleteSupplierAccount(
  supplierId: string,
  accountId: string,
  client: SupabaseClient = supabase
): Promise<void> {
  const supplier = await getSupplier(supplierId, client)

  if (!supplier) throw new Error('Supplier tidak ditemukan.')

  const account = supplier.accounts.find((item) => item.id === accountId)

  if (!account) throw new Error('Rekening tidak ditemukan.')

  const [mappingResult, transactionResult, bankTransferResult] =
    await Promise.all([
      client
        .from('kitchen_account_rules')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId),

      client
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId),

      client
        .from('bank_transactions')
        .select('*', { count: 'exact', head: true })
        .or(`account_id.eq.${accountId},recipient_account_id.eq.${accountId}`)
    ])

  if (mappingResult.error) throw mappingResult.error
  if (transactionResult.error) throw transactionResult.error
  if (bankTransferResult.error) throw bankTransferResult.error

  const mappingCount = mappingResult.count ?? 0
  const transactionCount = transactionResult.count ?? 0
  const bankTransferCount = bankTransferResult.count ?? 0

  if (mappingCount > 0) {
    throw new Error(
      `Rekening masih dipakai oleh ${mappingCount} dapur. Hapus mapping terlebih dahulu.`
    )
  }

  if (transactionCount > 0) {
    throw new Error(
      `Rekening tidak dapat dihapus karena sudah digunakan pada ${transactionCount} transaksi.`
    )
  }

  if (bankTransferCount > 0) {
    throw new Error(
      `Rekening tidak dapat dihapus karena sudah digunakan pada ${bankTransferCount} transaksi bank.`
    )
  }

  if (supplier.accounts.length <= 1) {
    throw new Error('Supplier harus memiliki minimal satu rekening.')
  }

  const { error } = await client.from('accounts').delete().eq('id', accountId)

  if (error) throw error
}

export async function getSupplier(
  supplierId: string,
  client: SupabaseClient = supabase
): Promise<Supplier | null> {
  const suppliers = await getSuppliers(client)

  return suppliers.find((supplier) => supplier.id === supplierId) ?? null
}

export async function getActiveKitchens(
  client: SupabaseClient = supabase
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await client
    .from('kitchens')
    .select('id,name')
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  return (data ?? []) as { id: string; name: string }[]
}

export async function getAccountKitchenIds(
  accountId: string,
  client: SupabaseClient = supabase
): Promise<string[]> {
  const { data, error } = await client
    .from('kitchen_account_rules')
    .select('kitchen_id')
    .eq('account_id', accountId)
    .eq('flow_type', 'income')

  if (error) throw error

  return (data ?? []).map((row) => row.kitchen_id as string)
}

export async function saveAccountKitchenMapping(
  accountId: string,
  kitchenIds: string[],
  client: SupabaseClient = supabase
): Promise<void> {
  const { error: deleteError } = await client
    .from('kitchen_account_rules')
    .delete()
    .eq('account_id', accountId)
    .eq('flow_type', 'income')

  if (deleteError) throw deleteError

  if (!kitchenIds.length) return

  const payload = kitchenIds.map((kitchenId) => ({
    account_id: accountId,
    kitchen_id: kitchenId,
    flow_type: 'income'
  }))

  const { error } = await client.from('kitchen_account_rules').insert(payload)

  if (error) throw error
}

function validateSupplierInput(input: SupplierInput) {
  if (!input.business_name.trim()) {
    throw new Error('Nama supplier wajib diisi.')
  }
}

function validateAccountInput(input: AccountInput) {
  if (!input.bank) {
    throw new Error('Bank wajib dipilih.')
  }

  if (!input.account_number.trim()) {
    throw new Error('Nomor rekening wajib diisi.')
  }
}

function toSupplierRecord(input: SupplierInput) {
  return {
    business_name: normalizeBusinessName(input.business_name),
    owner_name: input.owner_name.trim(),
    product_type: input.product_type.trim(),
    phone: input.phone.trim() || null,
    address: input.address.trim() || null
  }
}

function normalizeBusinessName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}
