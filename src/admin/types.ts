export interface OverviewKpis {
  tickets_activos: number
  tickets_resueltos_total: number
  tickets_nuevos: number
  tickets_resueltos_periodo: number
  perdidas_activas: number
  encontradas_activas: number
  reclamos_pendientes: number
  usuarios_nuevos: number
  reportes_pendientes: number
}

export interface TicketsTimeseriesRow {
  bucket: string
  kind: string
  total: number
}