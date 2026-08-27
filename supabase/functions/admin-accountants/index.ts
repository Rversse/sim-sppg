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

type Action = 'list' | 'create' | 'update' | 'set_password' | 'deactivate'

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

function normalizeName(value: unknown, label: string) {
  return text(value, label)
    .toLocaleLowerCase('id-ID')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('id-ID') + part.slice(1))
    .join(' ')
}

function normalizeBank(value: unknown) {
  const normalized = text(value, 'Bank')
    .toLocaleUpperCase('id-ID')
    .replace(/[^A-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) throw new Error('Bank hanya boleh berisi huruf.')
  return normalized
}

function normalizeAccountNumber(value: unknown) {
  const normalized = text(value, 'Nomor rekening').replace(/\D/g, '')
  if (!normalized) throw new Error('Nomor rekening harus berisi angka.')
  return normalized
}

async function getAdminUser(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new Error('Unauthorized')

  const { data, error } = await admin.auth.getUser(authorization.slice(7))
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

  const { data: history, error: historyError } = await admin
    .from('accountant_assignment_history')
    .select(
      'id,user_id,kitchen_id,kitchen_name,accountant_name,accountant_email,operational_account_id,operational_account_name,operational_bank,operational_account_number,assigned_at,ended_at,end_reason'
    )
    .eq('user_id', userId)
    .order('assigned_at', { ascending: false })

  if (historyError) throw historyError

  const latest = history?.[0]
  const active = Boolean(assignment?.kitchen_id)

  return {
    id: authData.user.id,
    email: authData.user.email ?? '',
    name,
    kitchenId: assignment?.kitchen_id ?? latest?.kitchen_id ?? null,
    kitchenName: kitchen?.name ?? latest?.kitchen_name ?? null,
    active,
    operationalAccount:
      operationalAccount ??
      (latest?.operational_account_id ||
      latest?.operational_account_name ||
      latest?.operational_bank ||
      latest?.operational_account_number
        ? {
            id: latest.operational_account_id ?? '',
            name: latest.operational_account_name ?? '',
            bank: latest.operational_bank ?? '',
            accountNumber: latest.operational_account_number
          }
        : null),
    lastAssignment: active
      ? null
      : latest
        ? {
            id: latest.id,
            userId: latest.user_id,
            kitchenId: latest.kitchen_id,
            kitchenName: latest.kitchen_name,
            accountantName: latest.accountant_name,
            accountantEmail: latest.accountant_email,
            operationalAccount:
              latest.operational_account_id ||
              latest.operational_account_name ||
              latest.operational_bank ||
              latest.operational_account_number
                ? {
                    id: latest.operational_account_id,
                    name: latest.operational_account_name,
                    bank: latest.operational_bank,
                    accountNumber: latest.operational_account_number
                  }
                : null,
            assignedAt: latest.assigned_at,
            endedAt: latest.ended_at,
            endReason: latest.end_reason
          }
        : null,
    historyCount: history?.length ?? 0,
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

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  })

  if (error) throw error

  const records: Awaited<ReturnType<typeof getRecord>>[] = []

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
    ) {
      continue
    }

    records.push(await getRecord(user.id))
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
    name: normalizeName(
      input.operationalAccountName,
      'Nama rekening operasional'
    ),
    bank: normalizeBank(input.operationalBank),
    accountNumber: normalizeAccountNumber(input.operationalAccountNumber)
  }
}

async function findOperationalAccount(bank: string, accountNumber: string) {
  const { data, error } = await admin
    .from('accounts')
    .select('id,name,bank,account_number,account_category')
    .eq('bank', bank)
    .eq('account_number', accountNumber)
    .maybeSingle()

  if (error) throw error
  return data
}

async function createNewOperationalAccount(input: AccountantInput) {
  const accountInput = ensureOperationalInput(input)
  const existing = await findOperationalAccount(
    accountInput.bank,
    accountInput.accountNumber
  )

  if (existing) {
    if (existing.account_category !== 'operational') {
      throw new Error(
        'Nomor rekening tersebut sudah digunakan oleh kategori akun lain.'
      )
    }

    throw new Error(
      'Rekening Biaya Operasional tersebut sudah terdaftar. Akuntan baru wajib menggunakan rekening yang belum pernah terdaftar.'
    )
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
  if (data) {
    throw new Error(
      'Rekening Biaya Operasional tersebut sudah dipakai dapur lain.'
    )
  }
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
  const name = normalizeName(input.name, 'Nama')
  const kitchenId = uuid(input.kitchenId, 'Dapur')

  if (password.length < 8) throw new Error('Password minimal 8 karakter.')

  await ensureKitchenFree(kitchenId)

  // New accountants must receive a new operational account. An account that
  // already exists is historical/master data and must never be silently reused.
  const operational = await createNewOperationalAccount(input)
  await ensureOperationalAccountNotElsewhere(operational.account.id, kitchenId)

  let createdUserId: string | null = null

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, account_type: 'accountant' }
    })

    if (error) throw error
    if (!data.user) throw new Error('User Auth gagal dibuat.')

    createdUserId = data.user.id

    await setAssignment(data.user.id, kitchenId, operational.account.id)
    return getRecord(data.user.id)
  } catch (error) {
    if (createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId)
    }

    if (operational.created) {
      await admin.from('accounts').delete().eq('id', operational.account.id)
    }

    throw error
  }
}

async function updateOperationalAccount(
  accountId: string,
  input: AccountantInput
) {
  const accountInput = ensureOperationalInput(input)

  const { data: existing, error: existingError } = await admin
    .from('accounts')
    .select('id,account_category')
    .eq('id', accountId)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing || existing.account_category !== 'operational') {
    throw new Error('Rekening operasional tidak ditemukan.')
  }

  const conflicting = await findOperationalAccount(
    accountInput.bank,
    accountInput.accountNumber
  )

  if (conflicting && conflicting.id !== accountId) {
    throw new Error(
      'Nomor rekening tersebut sudah terdaftar sebagai rekening operasional lain.'
    )
  }

  const { data, error } = await admin
    .from('accounts')
    .update({
      name: accountInput.name,
      bank: accountInput.bank,
      account_number: accountInput.accountNumber,
      updated_at: new Date().toISOString()
    })
    .eq('id', accountId)
    .select('id,name,bank,account_number,account_category')
    .single()

  if (error) throw error
  return data
}

async function updateAccountant(userId: string, input: AccountantInput) {
  uuid(userId, 'User')

  const email = text(input.email, 'Email').toLowerCase()
  const name = normalizeName(input.name, 'Nama')
  const kitchenId = uuid(input.kitchenId, 'Dapur')

  await ensureKitchenFree(kitchenId, userId)

  const { data: previous, error: previousError } = await admin
    .from('accountant_profiles')
    .select('kitchen_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (previousError) throw previousError
  if (!previous?.kitchen_id) {
    throw new Error(
      'Akun tidak aktif. Gunakan Tambah Akuntan untuk membuat user pengganti.'
    )
  }

  const { data: previousRule, error: previousRuleError } = await admin
    .from('kitchen_account_rules')
    .select('account_id')
    .eq('kitchen_id', previous.kitchen_id)
    .eq('flow_type', 'operational')
    .maybeSingle()

  if (previousRuleError) throw previousRuleError

  const previousKitchenId = previous.kitchen_id
  const previousAccountId = previousRule?.account_id ?? null

  let createdAccount = false
  let targetAccountId: string

  if (previousAccountId) {
    const accountInput = ensureOperationalInput(input)
    const matching = await findOperationalAccount(
      accountInput.bank,
      accountInput.accountNumber
    )

    if (matching && matching.id !== previousAccountId) {
      await ensureOperationalAccountNotElsewhere(matching.id, kitchenId)
      targetAccountId = matching.id
    } else {
      await updateOperationalAccount(previousAccountId, input)
      targetAccountId = previousAccountId
    }
  } else {
    const operational = await createNewOperationalAccount(input)
    targetAccountId = operational.account.id
    createdAccount = operational.created
  }

  await ensureOperationalAccountNotElsewhere(targetAccountId, kitchenId)
  await setAssignment(userId, kitchenId, targetAccountId)

  try {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      email,
      user_metadata: { full_name: name, account_type: 'accountant' }
    })

    if (authError) throw authError
  } catch (error) {
    if (previousKitchenId && previousAccountId) {
      await setAssignment(userId, previousKitchenId, previousAccountId)
    }
    if (createdAccount) {
      await admin.from('accounts').delete().eq('id', targetAccountId)
    }
    throw error
  }

  return getRecord(userId)
}

async function deactivateAccountant(userId: string) {
  uuid(userId, 'User')

  const { data: assignment, error: assignmentError } = await admin
    .from('accountant_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (assignmentError) throw assignmentError
  if (!assignment) {
    throw new Error('Akun tersebut tidak memiliki assignment aktif.')
  }

  const { error } = await admin
    .from('accountant_profiles')
    .delete()
    .eq('user_id', userId)

  if (error) throw error
}

async function setPassword(userId: string, password: string) {
  uuid(userId, 'User')
  const nextPassword = text(password, 'Password')

  if (nextPassword.length < 8) {
    throw new Error('Password minimal 8 karakter.')
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: nextPassword
  })

  if (error) throw error
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

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
