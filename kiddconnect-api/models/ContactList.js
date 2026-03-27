import { supabaseClient } from '../config/database.js';

export class ContactList {
  static async create(data) {
    const {
      business_id,
      name,
      description,
    } = data;
    
    const { data: list, error } = await supabaseClient
      .from('contact_lists')
      .insert({
        business_id,
        name,
        description: description || null,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[ContactList Model] ❌ Error creating list:', error);
      throw error;
    }
    
    return list;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('contact_lists')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByBusinessId(business_id) {
    const { data, error } = await supabaseClient
      .from('contact_lists')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  static async update(id, updates) {
    const { data, error } = await supabaseClient
      .from('contact_lists')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async delete(id) {
    // Delete will cascade to contact_list_members
    const { error } = await supabaseClient
      .from('contact_lists')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { success: true };
  }
  
  static async addContact(list_id, contact_id) {
    const { data, error } = await supabaseClient
      .from('contact_list_members')
      .insert({
        list_id,
        contact_id,
      })
      .select()
      .single();
    
    if (error) {
      // If already exists, return success
      if (error.code === '23505') {
        return { success: true, already_exists: true };
      }
      throw error;
    }
    
    return data;
  }
  
  static async removeContact(list_id, contact_id) {
    const { error } = await supabaseClient
      .from('contact_list_members')
      .delete()
      .eq('list_id', list_id)
      .eq('contact_id', contact_id);
    
    if (error) throw error;
    return { success: true };
  }
  
  static async getContacts(list_id) {
    const { data, error } = await supabaseClient
      .from('contact_list_members')
      .select(`
        *,
        contact:contacts(*)
      `)
      .eq('list_id', list_id);
    
    if (error) {
      console.error('[ContactList] Error getting contacts:', error);
      throw error;
    }
    
    // Filter out null contacts (deleted contacts that are still in list)
    return (data || [])
      .map(member => member.contact)
      .filter(contact => contact !== null && contact !== undefined);
  }
  
  static async getContactCount(list_id) {
    const { count, error } = await supabaseClient
      .from('contact_list_members')
      .select('*', { count: 'exact', head: true })
      .eq('list_id', list_id);
    
    if (error) throw error;
    return count || 0;
  }
}

