import { supabaseClient } from '../../config/database.js';

export class AuditLog {
  static async create(data) {
    const {
      business_id,
      user_id,
      admin_user_id,
      action,
      resource_type,
      resource_id,
      metadata,
      ip_address,
      user_agent,
    } = data;
    
    const { data: log, error } = await supabaseClient
      .from('audit_logs')
      .insert({
        business_id,
        user_id,
        admin_user_id,
        action,
        resource_type,
        resource_id,
        metadata,
        ip_address,
        user_agent,
      })
      .select()
      .single();
    
    if (error) throw error;
    return log;
  }
  
  static async findByBusinessId(business_id, limit = 100) {
    const { data, error } = await supabaseClient
      .from('audit_logs')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByUserId(user_id, limit = 100) {
    const { data, error } = await supabaseClient
      .from('audit_logs')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByAction(action, limit = 100) {
    const { data, error } = await supabaseClient
      .from('audit_logs')
      .select('*')
      .eq('action', action)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }

  static async find(filters = {}) {
    const {
      business_id,
      user_id,
      action,
      resource_type,
      limit = 100,
      offset = 0,
    } = filters;

    let query = supabaseClient
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (business_id) query = query.eq('business_id', business_id);
    if (user_id) query = query.eq('user_id', user_id);
    if (action) query = query.eq('action', action);
    if (resource_type) query = query.eq('resource_type', resource_type);

    const { data, error, count } = await query;

    if (error) throw error;
    
    return {
      records: data || [],
      total: count || 0,
    };
  }
}
