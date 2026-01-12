import { supabaseClient } from '../../config/database.js';

export class OrganizationJoinRequest {
  static async create(data) {
    const {
      business_id,
      user_id,
      requested_role = 'staff',
      message = null,
    } = data;
    
    const { data: request, error } = await supabaseClient
      .from('organization_join_requests')
      .insert({
        business_id,
        user_id,
        requested_role,
        message,
        status: 'pending',
      })
      .select()
      .single();
    
    if (error) throw error;
    return request;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('organization_join_requests')
      .select(`
        *,
        users (*),
        businesses (*)
      `)
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByBusinessId(business_id, status = null) {
    let query = supabaseClient
      .from('organization_join_requests')
      .select(`
        *,
        users (*)
      `)
      .eq('business_id', business_id);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByUserId(user_id, status = null) {
    let query = supabaseClient
      .from('organization_join_requests')
      .select(`
        *,
        businesses (*)
      `)
      .eq('user_id', user_id);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByUserAndBusiness(user_id, business_id, status = 'pending') {
    const { data, error } = await supabaseClient
      .from('organization_join_requests')
      .select('*')
      .eq('user_id', user_id)
      .eq('business_id', business_id)
      .eq('status', status)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async updateStatus(id, status, responded_by) {
    const { data, error } = await supabaseClient
      .from('organization_join_requests')
      .update({
        status,
        responded_by,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async cancel(id, user_id) {
    // Only allow cancellation by the requesting user
    const { data, error } = await supabaseClient
      .from('organization_join_requests')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user_id)
      .eq('status', 'pending')
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}


