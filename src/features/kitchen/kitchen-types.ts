export type Kitchen = {
  id: string
  name: string
  pic: string | null
  foundation: string | null
  address: string | null
  is_active: boolean
}

export type KitchenInput = {
  name: string
  pic: string
  foundation: string
  address: string
  is_active: boolean
}

export type KitchenWithVehicles = Kitchen
