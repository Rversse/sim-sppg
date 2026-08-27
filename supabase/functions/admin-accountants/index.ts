import 'edge-runtime-types'
import { createClient } from 'supabase'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!SUPABASE_URL || !SERVICE_ROLE_KEY)
  throw new Error('Missing required server configuration.')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

type AccountantInput = {
  email?: string
  password?: string
  name?: string
  kitchenId?: string
  operationalAccountName?: string
  operationalBank?: string
  operationalAccountNumber?: string
}

type Action =
  | 'list'
  | 'create'
  | 'update'
  | 'set_password'
  | 'deactivate'
  | 'delete'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' }
  })
}

function text(value: unknown, label: string) {
  const valueText = typeof value === 'string' ? value.trim() : ''
  if (!valueText) throw new Error(`${label} wajib diisi.`)
  return valueText
}

function uuid(value: unknown, label: string) {
  const valueText = text(value, label)
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      valueText
    )
  ) {
    throw new Error(`${label} tidak valid.`)
  }
  return valueText
}

async function getAdminUser(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new Error('Unauthorized')
  const token = authorization.slice(7)
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Error('Unauthorized')

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()
  if (profileError) throw profileError
  if (profile?.role !== 'admin') throw new Error('Akses admin diperlukan.')
  return data.user
}

async function getRecord(userId: string) {
  const { data: authData, error: authError } =
    await admin.auth.admin.getUserById(userId)
  if (authError || !authData.user) throw new Error('Akun tidak ditemukan.')

  const { data: assignment, error: assignmentError } = await admin
    .from('accountant_profiles')
    .select('user_id,kitchen_id,created_at,kitchens(id,name)')
    .eq('user_id', userId)
    .maybeSingle()
  if (assignmentError) throw assignmentError

  let operationalAccount: {
    id: string
    name: string
    bank: string
    accountNumber: string | null
  } | null = null
  if (assignment?.kitchen_id) {
    const { data: rule, error: ruleError } = await admin
      .from('kitchen_account_rules')
      .select(
        'account_id,accounts(id,name,bank,account_number,account_category)'
      )
      .eq('kitchen_id', assignment.kitchen_id)
      .eq('flow_type', 'operational')
      .maybeSingle()
    if (ruleError) throw ruleError
    const account = Array.isArray(rule?.accounts)
      ? rule.accounts[0]
      : rule?.accounts
    if (account) {
      operationalAccount = {
        id: account.id,
        name: account.name,
        bank: account.bank,
        accountNumber: account.account_number
      }
    }
  }

  const metadataName = authData.user.user_metadata?.full_name
  const name =
    typeof metadataName === 'string' && metadataName.trim()
      ? metadataName.trim()
      : (authData.user.email?.split('@')[0] ?? 'Akuntan')
  const kitchen = Array.isArray(assignment?.kitchens)
    ? assignment.kitchens[0]
    : assignment?.kitchens

  return {
    id: authData.user.id,
    email: authData.user.email ?? '',
    name,
    kitchenId: assignment?.kitchen_id ?? null,
    kitchenName: kitchen?.name ?? null,
    active: Boolean(assignment?.kitchen_id),
    operationalAccount,
    createdAt: authData.user.created_at,
    lastSignInAt: authData.user.last_sign_in_at ?? null
  }
}

async function listAccountants(currentAdminId: string) {
  const { data: assignments, error: assignmentError } = await admin
    .from('accountant_profiles')
    .select('user_id')
  if (assignmentError) throw assignmentError

  const assigned = new Set(
    (assignments ?? []).map((row: { user_id: string }) => row.user_id)
  )
  const records: Awaited<ReturnType<typeof getRecord>>[] = []

  for (const [page, perPage] of [[1, 1000] as const]) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    for (const user of data.users) {
      if (user.id === currentAdminId || !user.email) continue
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profileError) throw profileError
      if (profile?.role) continue
      if (
        !assigned.has(user.id) &&
        user.user_metadata?.account_type !== 'accountant'
      )
        continue
      records.push(await getRecord(user.id))
    }
  }

  return records.sort((a, b) =>
    a.email.localeCompare(b.email, 'id', { sensitivity: 'base' })
  )
}

async function ensureKitchenFree(kitchenId: string, exceptUserId?: string) {
  const { data, error } = await admin
    .from('accountant_profiles')
    .select('user_id')
    .eq('kitchen_id', kitchenId)
    .maybeSingle()
  if (error) throw error
  if (data && data.user_id !== exceptUserId)
    throw new Error('Dapur tersebut sudah memiliki akuntan aktif.')
}

function ensureOperationalInput(input: AccountantInput) {
  return {
    name: text(input.operationalAccountName, 'Nama rekening operasional'),
    bank: text(input.operationalBank, 'Bank').toUpperCase(),
    accountNumber: text(input.operationalAccountNumber, 'Nomor rekening')
  }
}

async function findOrCreateOperationalAccount(input: AccountantInput) {
  const accountInput = await ensureOperationalInput(input)
  const { data: existing, error: lookupError } = await admin
    .from('accounts')
    .select('id,name,bank,account_number,account_category')
    .eq('bank', accountInput.bank)
    .eq('account_number', accountInput.accountNumber)
    .maybeSingle()
  if (lookupError) throw lookupError
  if (existing) {
    if (existing.account_category !== 'operational') {
      throw new Error(
        'Nomor rekening tersebut sudah digunakan oleh kategori akun lain.'
      )
    }
    return { account: existing, created: false }
  }

  const { data, error } = await admin
    .from('accounts')
    .insert({
      name: accountInput.name,
      bank: accountInput.bank,
      account_number: accountInput.accountNumber,
      supplier_id: null,
      opening_balance: 0,
      account_category: 'operational',
      is_holding_destination: false,
      created_by: null,
      updated_by: null
    })
    .select('id,name,bank,account_number,account_category')
    .single()
  if (error) throw error
  return { account: data, created: true }
}

async function ensureOperationalAccountNotElsewhere(
  accountId: string,
  kitchenId: string
) {
  const { data, error } = await admin
    .from('kitchen_account_rules')
    .select('kitchen_id')
    .eq('flow_type', 'operational')
    .eq('account_id', accountId)
    .neq('kitchen_id', kitchenId)
    .maybeSingle()
  if (error) throw error
  if (data)
    throw new Error(
      'Rekening Biaya Operasional tersebut sudah dipakai dapur lain.'
    )
}

async function setAssignment(
  userId: string,
  kitchenId: string,
  accountId: string
) {
  await ensureKitchenFree(kitchenId, userId)
  await ensureOperationalAccountNotElsewhere(accountId, kitchenId)

  const { error: profileError } = await admin
    .from('accountant_profiles')
    .upsert(
      { user_id: userId, kitchen_id: kitchenId },
      { onConflict: 'user_id' }
    )
  if (profileError) throw profileError

  const { error: deleteError } = await admin
    .from('kitchen_account_rules')
    .delete()
    .eq('kitchen_id', kitchenId)
    .eq('flow_type', 'operational')
  if (deleteError) throw deleteError

  const { error: insertError } = await admin
    .from('kitchen_account_rules')
    .insert({
      kitchen_id: kitchenId,
      account_id: accountId,
      flow_type: 'operational'
    })
  if (insertError) throw insertError
}

async function createAccountant(input: AccountantInput) {
  const email = text(input.email, 'Email').toLowerCase()
  const password = text(input.password, 'Password')
  const name = text(input.name, 'Nama')
  const kitchenId = uuid(input.kitchenId, 'Dapur')
  if (password.length < 8) throw new Error('Password minimal 8 karakter.')

  await ensureKitchenFree(kitchenId)
  const operational = await findOrCreateOperationalAccount(input)
  await ensureOperationalAccountNotElsewhere(operational.account.id, kitchenId)

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, account_type: 'accountant' }
  })
  if (error) throw error
  if (!data.user) throw new Error('User Auth gagal dibuat.')

  try {
    await setAssignment(data.user.id, kitchenId, operational.account.id)
    return getRecord(data.user.id)
  } catch (error) {
    await admin.auth.admin.deleteUser(data.user.id)
    if (operational.created) {
      await admin.from('accounts').delete().eq('id', operational.account.id)
    }
    throw error
  }
}

async function updateAccountant(userId: string, input: AccountantInput) {
  uuid(userId, 'User')
  const email = text(input.email, 'Email').toLowerCase()
  const name = text(input.name, 'Nama')
  const kitchenId = uuid(input.kitchenId, 'Dapur')
  await ensureKitchenFree(kitchenId, userId)
  const operational = await findOrCreateOperationalAccount(input)
  await ensureOperationalAccountNotElsewhere(operational.account.id, kitchenId)

  const { data: previous, error: previousError } = await admin
    .from('accountant_profiles')
    .select('kitchen_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (previousError) throw previousError

  const previousKitchenId = previous?.kitchen_id ?? null
  let previousAccountId: string | null = null
  if (previousKitchenId) {
    const { data: previousRule, error: previousRuleError } = await admin
      .from('kitchen_account_rules')
      .select('account_id')
      .eq('kitchen_id', previousKitchenId)
      .eq('flow_type', 'operational')
      .maybeSingle()
    if (previousRuleError) throw previousRuleError
    previousAccountId = previousRule?.account_id ?? null
  }

  await setAssignment(userId, kitchenId, operational.account.id)

  try {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      email,
      user_metadata: { full_name: name, account_type: 'accountant' }
    })
    if (authError) throw authError
  } catch (error) {
    if (previousKitchenId && previousAccountId) {
      await setAssignment(userId, previousKitchenId, previousAccountId)
    } else {
      await admin.from('accountant_profiles').delete().eq('user_id', userId)
    }
    if (operational.created) {
      await admin.from('accounts').delete().eq('id', operational.account.id)
    }
    throw error
  }

  return getRecord(userId)
}

async function deactivateAccountant(userId: string) {
  uuid(userId, 'User')
  const { error } = await admin
    .from('accountant_profiles')
    .delete()
    .eq('user_id', userId)
  if (error) throw error
}

async function assertNoHistory(userId: string) {
  const checks = await Promise.all([
    admin
      .from('disbursement_maker_items')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId),
    admin
      .from('disbursement_maker_items')
      .select('id', { count: 'exact', head: true })
      .eq('updated_by', userId),
    admin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId),
    admin
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
  ])
  for (const check of checks as Array<{ error: unknown; count: number | null }>)
    if (check.error) throw check.error
  if (
    checks.some(
      (check: { error: unknown; count: number | null }) =>
        (check.count ?? 0) > 0
    )
  ) {
    throw new Error(
      'Akun memiliki histori data. Gunakan Nonaktifkan agar histori tetap aman.'
    )
  }
}

async function deleteAccountant(userId: string) {
  uuid(userId, 'User')
  await assertNoHistory(userId)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw error
}

async function setPassword(userId: string, password: string) {
  uuid(userId, 'User')
  const nextPassword = text(password, 'Password')
  if (nextPassword.length < 8) throw new Error('Password minimal 8 karakter.')
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: nextPassword
  })
  if (error) throw error
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST')
    return json({ error: 'Method not allowed' }, 405)

  let adminUser
  try {
    adminUser = await getAdminUser(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized'
    return json({ error: message }, message === 'Unauthorized' ? 401 : 403)
  }

  try {
    const payload = (await request.json()) as {
      action?: Action
      userId?: string
      input?: AccountantInput
      password?: string
    }

    switch (payload.action) {
      case 'list':
        return json({ data: await listAccountants(adminUser.id) })
      case 'create':
        return json({ data: await createAccountant(payload.input ?? {}) })
      case 'update':
        return json({
          data: await updateAccountant(
            text(payload.userId, 'User'),
            payload.input ?? {}
          )
        })
      case 'set_password':
        await setPassword(
          text(payload.userId, 'User'),
          text(payload.password, 'Password')
        )
        return json({ data: null })
      case 'deactivate':
        await deactivateAccountant(text(payload.userId, 'User'))
        return json({ data: null })
      case 'delete':
        await deleteAccountant(text(payload.userId, 'User'))
        return json({ data: null })
      default:
        return json({ error: 'Action tidak valid.' }, 400)
    }
  } catch (error) {
    console.error(error)
    return json(
      { error: error instanceof Error ? error.message : 'Operasi gagal.' },
      400
    )
  }
})
