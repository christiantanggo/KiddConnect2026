import { supabaseClient } from '../../config/database.js';

export class Module {
  static async findAll(includeInactive = false) {
    let query = supabaseClient
      .from('modules')
      .select('*')
      .order('name');
    
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByKey(key) {
    const { data, error } = await supabaseClient
      .from('modules')
      .select('*')
      .eq('key', key)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('modules')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async update(idOrKey, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    // Support both ID and key lookups
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrKey);
    const filter = isUuid ? { id: idOrKey } : { key: idOrKey };
    
    const { data: module, error } = await supabaseClient
      .from('modules')
      .update(updateData)
      .match(filter)
      .select()
      .single();
    
    if (error) throw error;
    return module;
  }
  
  static async updateHealthStatus(key, health_status) {
    const { data, error } = await supabaseClient
      .from('modules')
      .update({ 
        health_status,
        updated_at: new Date().toISOString()
      })
      .eq('key', key)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}
