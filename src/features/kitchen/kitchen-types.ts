export type KitchenAudit = {
  created_at: string | null
  created_by: string | null
  created_by_name: string | null
  updated_at: string | null
  updated_by: string | null
  updated_by_name: string | null
}

export type Kitchen = {
  id: string
  name: string
  pic: string | null
  foundation: string | null
  address: string | null
  is_active: boolean
} & KitchenAudit

export type KitchenInput = {
  name: string
  pic: string
  foundation: string
  address: string
  is_active: boolean
}

export type KitchenWithVehicles = Kitchen
