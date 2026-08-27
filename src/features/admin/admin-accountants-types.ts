export type AccountantAssignmentHistoryRecord = {
  id: string
  userId: string
  kitchenId: string
  kitchenName: string
  accountantName: string
  accountantEmail: string
  operationalAccount: {
    id: string | null
    name: string | null
    bank: string | null
    accountNumber: string | null
  } | null
  assignedAt: string
  endedAt: string | null
  endReason: string | null
}

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
  lastAssignment: AccountantAssignmentHistoryRecord | null
  historyCount: number
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
