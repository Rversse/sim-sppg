export type Kitchen = {
  id: string
  name: string
  id_sppg: string | null
  pic: string | null
  foundation: string | null
  address: string | null
  operational_recipient_name: string | null
  is_active: boolean
}

export type KitchenInput = {
  name: string
  id_sppg: string
  pic: string
  foundation: string
  address: string
  operational_recipient_name: string
  is_active: boolean
}

export type KitchenWithVehicles = Kitchen
