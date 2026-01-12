import { supabaseClient } from '../../config/database.js';

export class PlatformVersion {
  static async create(data) {
    const {
      version,
      description,
      metadata,
    } = data;
    
    const { data: platformVersion, error } = await supabaseClient
      .from('platform_version')
      .insert({
        version,
        description,
        metadata,
      })
      .select()
      .single();
    
    if (error) throw error;
    return platformVersion;
  }
  
  static async getCurrent() {
    const { data, error } = await supabaseClient
      .from('platform_version')
      .select('*')
      .order('applied_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findAll() {
    const { data, error } = await supabaseClient
      .from('platform_version')
      .select('*')
      .order('applied_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
}

