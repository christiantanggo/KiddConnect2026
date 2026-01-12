import { supabaseClient } from '../../config/database.js';

export class ModuleSettings {
  static async create(data) {
    const {
      business_id,
      module_key,
      settings = {},
    } = data;
    
    const { data: moduleSettings, error } = await supabaseClient
      .from('module_settings')
      .insert({
        business_id,
        module_key,
        settings,
      })
      .select()
      .single();
    
    if (error) throw error;
    return moduleSettings;
  }
  
  static async findByBusinessAndModule(business_id, module_key) {
    const { data, error } = await supabaseClient
      .from('module_settings')
      .select('*')
      .eq('business_id', business_id)
      .eq('module_key', module_key)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async update(business_id, module_key, settings) {
    // Try to update first
    const existing = await this.findByBusinessAndModule(business_id, module_key);
    
    if (existing) {
      const { data, error } = await supabaseClient
        .from('module_settings')
        .update({
          settings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (error) throw error;
      if (!data) {
        throw new Error('Failed to update module settings: No data returned from database');
      }
      return data;
    } else {
      // Create if doesn't exist
      return await this.create({ business_id, module_key, settings });
    }
  }
  
  static async findByBusinessId(business_id) {
    const { data, error } = await supabaseClient
      .from('module_settings')
      .select('*')
      .eq('business_id', business_id);
    
    if (error) throw error;
    return data || [];
  }
}
