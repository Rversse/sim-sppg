export type MakerFlow = 'income' | 'neutral'

export type MakerStatus = 'READY' | 'PROCESSED' | 'REALIZED'

export type MakerKitchen = {
  id: string
  name: string
}

export type MakerAccountOption = {
  accountId: string
  accountName: string
  bank: string
  accountNumber: string
  supplierId: string | null
  supplierName: string | null
  supplierOwnerName: string | null
  supplierProducts: string[]
}

export type MakerItem = {
  id: string
  kitchenId: string
  transactionDate: string
  accountId: string
  amount: number
  flowType: MakerFlow
  selectedProducts: string[]
  status: MakerStatus
  realizedTransactionId: string | null
  createdAt: string
  updatedAt: string
}
