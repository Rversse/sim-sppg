export type Kitchen = {
  id: string
  name: string
  id_sppg: string | null
  pic: string | null
  foundation: string | null
  address: string | null
  is_active: boolean
}

export type KitchenInput = {
  name: string
  id_sppg: string
  pic: string
  foundation: string
  address: string
  is_active: boolean
}

export type KitchenWithVehicles = Kitchen
