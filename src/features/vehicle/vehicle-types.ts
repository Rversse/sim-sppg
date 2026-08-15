export type VehicleType = 'car' | 'motorcycle'

export type Vehicle = {
  id: string
  kitchen_id: string
  vehicle_type: VehicleType
  vehicle_name: string | null
  plate_number: string
  pkb_expiry: string | null
  stnk_expiry: string | null
  kitchen: { name: string } | null
}

export type VehicleInput = {
  kitchen_id: string
  vehicle_type: VehicleType
  vehicle_name: string
  plate_number: string
  pkb_expiry: string
  stnk_expiry: string
}
