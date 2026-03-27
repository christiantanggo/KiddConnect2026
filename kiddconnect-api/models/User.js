import { supabaseClient } from '../config/database.js';

export class User {
  static async create(data) {
    const {
      business_id,
      email,
      password_hash,
      first_name,
      last_name,
      role = 'owner',
      terms_accepted_at,
      privacy_accepted_at,
      terms_version,
      terms_accepted_ip,
    } = data;
    
    const insertData = {
      business_id,
      email,
      password_hash,
      first_name,
      last_name,
      role,
    };
    
    // Add terms acceptance fields if provided (for new signups)
    if (terms_accepted_at !== undefined) {
      insertData.terms_accepted_at = terms_accepted_at;
    }
    if (privacy_accepted_at !== undefined) {
      insertData.privacy_accepted_at = privacy_accepted_at;
    }
    if (terms_version !== undefined) {
      insertData.terms_version = terms_version;
    }
    if (terms_accepted_ip !== undefined) {
      insertData.terms_accepted_ip = terms_accepted_ip;
    }
    
    const { data: user, error } = await supabaseClient
      .from('users')
      .insert(insertData)
      .select()
      .single();
    
    if (error) throw error;
    return user;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByEmail(email) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('email', email)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByBusinessId(business_id) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('business_id', business_id)
      .is('deleted_at', null);
    
    if (error) throw error;
    return data || [];
  }
  
  static async updateLastLogin(id) {
    const { data, error } = await supabaseClient
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async update(id, data) {
    const updateData = { ...data };
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    // Only add updated_at if the column exists (check by trying to update without it first)
    // If that fails, we'll know updated_at doesn't exist
    const { data: user, error } = await supabaseClient
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return user;
  }
}
