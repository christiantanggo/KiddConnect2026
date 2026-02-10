import { supabaseClient } from '../../config/database.js';

export class OrganizationUser {
  static async create(data) {
    const {
      business_id,
      user_id,
      role = 'staff',
    } = data;
    
    const { data: orgUser, error } = await supabaseClient
      .from('organization_users')
      .insert({
        business_id,
        user_id,
        role,
      })
      .select()
      .single();
    
    if (error) throw error;
    return orgUser;
  }
  
  static async findByUserId(user_id) {
    const { data, error } = await supabaseClient
      .from('organization_users')
      .select(`
        *,
        businesses (*)
      `)
      .eq('user_id', user_id)
      .is('deleted_at', null);
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByBusinessId(business_id) {
    const { data, error } = await supabaseClient
      .from('organization_users')
      .select(`
        *,
        users (*)
      `)
      .eq('business_id', business_id)
      .is('deleted_at', null);
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByUserAndBusiness(user_id, business_id) {
    const { data, error } = await supabaseClient
      .from('organization_users')
      .select('*')
      .eq('user_id', user_id)
      .eq('business_id', business_id)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    const { data: orgUser, error } = await supabaseClient
      .from('organization_users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return orgUser;
  }
  
  static async remove(id) {
    const { data, error } = await supabaseClient
      .from('organization_users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}




