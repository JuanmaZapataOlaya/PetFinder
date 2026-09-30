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

export async function getClaimsDashboard(from: string, to: string) {
  const { data, error } = await supabase.rpc('admin_claims_dashboard', { p_from: from, p_to: to })
  if (error) throw error
  return data || {}
}

export async function getReportsDashboard(from: string, to: string) {
  const { data, error } = await supabase.rpc('admin_reports_dashboard', { p_from: from, p_to: to })
  if (error) throw error
  return data || {}
}

export async function getCostsDashboard(from: string, to: string) {
  const { data, error } = await supabase.rpc('admin_costs_dashboard', { p_from: from, p_to: to })
  if (error) throw error
  return data || {}
}

export async function getUsersPage(limit = 100, offset = 0) {
  const { data, error } = await supabase.rpc('admin_users_page', { p_limit: limit, p_offset: offset })
  if (error) throw error
  return data || { users: [], total: 0 }
}

export async function deleteUser(userId: string) {
  const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId })
  if (error) throw error
}

export async function getAuditLogs(limit = 100, offset = 0) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return data || []
}

export async function getAllClaims() {
  const { data, error } = await supabase
    .from('app_notifications') // Asegúrate de que esta sea la tabla correcta de reclamos
    // Traemos todo de la tabla base (*), más los campos específicos de la relación
    .select('*, pet_tickets(name, kind, location)') 
    .eq('reported', false)
    .order('created_at', { ascending: false })
    
  if (error) throw error
  return data || []
}