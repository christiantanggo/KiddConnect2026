import { supabaseClient } from '../config/database.js';

export class GlobalModifier {
  /**
   * Find all global modifiers for a business
   */
  static async findByBusinessId(businessId, options = {}) {
    const { activeOnly = true } = options;
    
    let query = supabaseClient
      .from('global_modifiers')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null);
    
    if (activeOnly) {
      query = query.eq('is_active', true);
    }
    
    query = query.order('display_order', { ascending: true })
                 .order('name', { ascending: true });
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[GlobalModifier] Error fetching modifiers:', error);
      throw error;
    }
    
    return data || [];
  }

  /**
   * Find a global modifier by ID
   */
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('global_modifiers')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[GlobalModifier] Error fetching modifier:', error);
      throw error;
    }
    
    return data;
  }

  /**
   * Create a new global modifier
   */
  static async create(data) {
    const {
      business_id,
      name,
      description,
      price = 0,
      is_free,
      category,
      is_active = true,
      display_order = 0,
    } = data;
    
    const parsedPrice = parseFloat(price) || 0;
    // If is_free is explicitly provided, use it; otherwise determine from price
    const finalIsFree = is_free !== undefined 
      ? is_free 
      : (parsedPrice === 0);
    
    console.log('[GlobalModifier] Creating modifier:', {
      business_id,
      name,
      price: parsedPrice,
      is_free: finalIsFree,
      is_free_provided: is_free !== undefined,
    });
    
    const { data: modifier, error } = await supabaseClient
      .from('global_modifiers')
      .insert({
        business_id,
        name,
        description,
        price: parsedPrice,
        is_free: finalIsFree,
        category,
        is_active,
        display_order,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[GlobalModifier] Error creating modifier:', error);
      throw error;
    }
    
    console.log('[GlobalModifier] ✅ Modifier created successfully:', modifier.id);
    return modifier;
  }

  /**
   * Update a global modifier
   */
  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    // Ensure is_free is set correctly based on price
    if (updateData.price !== undefined) {
      updateData.is_free = !updateData.price || parseFloat(updateData.price) === 0;
    }
    
    if (updateData.price !== undefined) {
      updateData.price = parseFloat(updateData.price) || 0;
    }
    
    const { data: modifier, error } = await supabaseClient
      .from('global_modifiers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('[GlobalModifier] Error updating modifier:', error);
      throw error;
    }
    
    return modifier;
  }

  /**
   * Delete a global modifier (soft delete)
   */
  static async delete(id) {
    const { error } = await supabaseClient
      .from('global_modifiers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) {
      console.error('[GlobalModifier] Error deleting modifier:', error);
      throw error;
    }
  }
}

