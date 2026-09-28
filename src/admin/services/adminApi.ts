import { supabase } from '@/services/supabase'
import type { OverviewKpis, TicketsTimeseriesRow } from '@/admin/types'

export async function getOverviewKpis(from: string, to: string) {
  const { data, error } = await supabase.rpc('admin_overview_kpis', { p_from: from, p_to: to })
  if (error) throw error
  return (data?.[0] || null) as OverviewKpis | null
}

export async function getTicketsTimeseries(from: string, to: string, bucket = 'day') {
  const { data, error } = await supabase.rpc('admin_tickets_timeseries', {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
    p_type: null,
    p_kind: null,
  })
  if (error) throw error
  return (data || []) as TicketsTimeseriesRow[]
}