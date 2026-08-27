export type AccountantRecord = {
  id: string
  email: string
  name: string
  kitchenId: string | null
  kitchenName: string | null
  active: boolean
  operationalAccount: {
    id: string
    name: string
    bank: string
    accountNumber: string | null
  } | null
  createdAt: string
  lastSignInAt: string | null
}

export type AccountantFormInput = {
  email: string
  password?: string
  name: string
  kitchenId: string
  operationalAccountName: string
  operationalBank: string
  operationalAccountNumber: string
}
