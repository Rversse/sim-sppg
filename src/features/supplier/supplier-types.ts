export type SupplierAccountRule = {
  kitchen_id: string
  kitchens: { name: string } | null
}

export type SupplierAccount = {
  id: string
  supplier_id: string
  name: string
  bank: string
  account_number: string | null
  opening_balance: number
  created_at: string | null
  updated_at: string | null
  created_by: string | null
  updated_by: string | null
  kitchen_account_rules: SupplierAccountRule[]
}

export type Supplier = {
  created_at: string
  created_by: string | null
  created_by_name: string | null
  updated_at: string
  updated_by: string | null
  updated_by_name: string | null
  id: string
  business_name: string
  owner_name: string | null
  product_type: string | null
  phone: string | null
  address: string | null
  accounts: SupplierAccount[]
}

export type SupplierInput = {
  business_name: string
  owner_name: string
  product_type: string
  phone: string
  address: string
}

export type AccountInput = {
  bank: string
  account_number: string
  opening_balance: number
}
