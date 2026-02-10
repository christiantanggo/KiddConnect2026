import { supabaseClient } from '../../config/database.js';

export class UsageLog {
  static async create(data) {
    const {
      business_id,
      user_id,
      module_key,
      action,
      units_used = 1,
      metadata,
    } = data;
    
    const { data: log, error } = await supabaseClient
      .from('usage_logs')
      .insert({
        business_id,
        user_id,
        module_key,
        action,
        units_used,
        metadata,
      })
      .select()
      .single();
    
    if (error) throw error;
    return log;
  }
  
  static async findByBusinessAndModule(business_id, module_key, startDate, endDate) {
    let query = supabaseClient
      .from('usage_logs')
      .select('*')
      .eq('business_id', business_id)
      .eq('module_key', module_key)
      .order('created_at', { ascending: false });
    
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('created_at', endDate);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }
  
  static async getTotalUsage(business_id, module_key, startDate, endDate) {
    let query = supabaseClient
      .from('usage_logs')
      .select('units_used', { count: 'exact' })
      .eq('business_id', business_id)
      .eq('module_key', module_key);
    
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('created_at', endDate);
    }
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    const total = (data || []).reduce((sum, log) => sum + parseFloat(log.units_used || 0), 0);
    
    return {
      total,
      count: count || 0,
    };
  }
}




