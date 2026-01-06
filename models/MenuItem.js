import { supabaseClient } from '../config/database.js';

export class MenuItem {
  /**
   * Get next item number for a business
   */
  static async getNextItemNumber(businessId) {
    const { data, error } = await supabaseClient
      .from('menu_items')
      .select('item_number')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('item_number', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('[MenuItem] Error getting next item number:', error);
      throw error;
    }
    
    return (data?.item_number || 0) + 1;
  }

  /**
   * Create a new menu item (automatically assigns item number)
   */
  static async create(data) {
    const {
      business_id,
      name,
      description,
      category,
      price,
      is_available = true,
      display_order = 0,
      image_url,
      external_id,
      metadata = {},
      modifiers = { free: [], paid: [] },
      global_modifier_ids = [],
    } = data;
    
    // Get next item number
    const item_number = await this.getNextItemNumber(business_id);
    
    const { data: item, error } = await supabaseClient
      .from('menu_items')
      .insert({
        business_id,
        item_number,
        name,
        description,
        category,
        price,
        is_available,
        display_order,
      image_url,
      external_id,
      metadata,
      modifiers: modifiers || { free: [], paid: [] },
      global_modifier_ids: global_modifier_ids || [],
      })
      .select()
      .single();
    
    if (error) {
      console.error('[MenuItem] Error creating menu item:', error);
      throw error;
    }
    
    return item;
  }

  /**
   * Find menu item by ID
   */
  static async findById(itemId) {
    const { data, error } = await supabaseClient
      .from('menu_items')
      .select('*')
      .eq('id', itemId)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Find menu item by business ID and item number
   */
  static async findByBusinessIdAndNumber(businessId, itemNumber) {
    const { data, error } = await supabaseClient
      .from('menu_items')
      .select('*')
      .eq('business_id', businessId)
      .eq('item_number', itemNumber)
      .is('deleted_at', null)
      .is('is_active', true)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Find all menu items for a business
   */
  static async findByBusinessId(businessId, options = {}) {
    const {
      includeUnavailable = false,
      category = null,
      activeOnly = true,
    } = options;
    
    let query = supabaseClient
      .from('menu_items')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null);
    
    if (activeOnly) {
      query = query.eq('is_active', true);
    }
    
    if (!includeUnavailable) {
      query = query.eq('is_available', true);
    }
    
    if (category) {
      query = query.eq('category', category);
    }
    
    query = query.order('category', { ascending: true })
                  .order('display_order', { ascending: true })
                  .order('item_number', { ascending: true });
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }

  /**
   * Update menu item
   */
  static async update(itemId, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    // Ensure global_modifier_ids is an array (handle both array and null/undefined)
    if (updateData.global_modifier_ids !== undefined) {
      updateData.global_modifier_ids = Array.isArray(updateData.global_modifier_ids) 
        ? updateData.global_modifier_ids 
        : [];
    }
    
    console.log('[MenuItem] Updating item:', {
      itemId,
      updateDataKeys: Object.keys(updateData),
      global_modifier_ids: updateData.global_modifier_ids,
    });
    
    const { data: item, error } = await supabaseClient
      .from('menu_items')
      .update(updateData)
      .eq('id', itemId)
      .select()
      .single();
    
    if (error) {
      console.error('[MenuItem] Update error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    
    return item;
  }

  /**
   * Soft delete menu item (sets deleted_at timestamp)
   */
  static async delete(itemId) {
    return this.update(itemId, {
      deleted_at: new Date().toISOString(),
      is_active: false,
    });
  }

  /**
   * Get menu formatted for AI/display (with item numbers)
   */
  static async getFormattedMenu(businessId, options = {}) {
    const items = await this.findByBusinessId(businessId, options);
    
    // Group by category
    const menuByCategory = {};
    items.forEach(item => {
      const category = item.category || 'Other';
      if (!menuByCategory[category]) {
        menuByCategory[category] = [];
      }
      menuByCategory[category].push(item);
    });
    
    return {
      items,
      byCategory: menuByCategory,
    };
  }
}

