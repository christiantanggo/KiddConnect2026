import { supabaseClient } from '../../config/database.js';

export class RolePermission {
  static async findByRole(role) {
    const { data, error } = await supabaseClient
      .from('role_permissions')
      .select(`
        *,
        permissions (*)
      `)
      .eq('role', role);
    
    if (error) throw error;
    return data || [];
  }
  
  static async hasPermission(role, permission_key) {
    const { data, error } = await supabaseClient
      .from('role_permissions')
      .select('*')
      .eq('role', role)
      .eq('permission_key', permission_key)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }
  
  static async create(data) {
    const { role, permission_key } = data;
    
    const { data: rolePermission, error } = await supabaseClient
      .from('role_permissions')
      .insert({
        role,
        permission_key,
      })
      .select()
      .single();
    
    if (error) throw error;
    return rolePermission;
  }
  
  static async remove(role, permission_key) {
    const { error } = await supabaseClient
      .from('role_permissions')
      .delete()
      .eq('role', role)
      .eq('permission_key', permission_key);
    
    if (error) throw error;
    return true;
  }
}

