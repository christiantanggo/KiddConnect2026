import { supabaseClient } from '../../config/database.js';

export class Permission {
  static async findAll() {
    const { data, error } = await supabaseClient
      .from('permissions')
      .select('*')
      .order('key');
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByKey(key) {
    const { data, error } = await supabaseClient
      .from('permissions')
      .select('*')
      .eq('key', key)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
}




