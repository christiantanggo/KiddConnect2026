import { supabaseClient } from '../../config/database.js';

export class Notification {
  static async create(data) {
    const {
      business_id,
      user_id,
      type,
      message,
      metadata,
    } = data;
    
    const { data: notification, error } = await supabaseClient
      .from('notifications')
      .insert({
        business_id,
        user_id,
        type,
        message,
        metadata,
      })
      .select()
      .single();
    
    if (error) throw error;
    return notification;
  }
  
  static async findByBusinessId(business_id, unreadOnly = false) {
    let query = supabaseClient
      .from('notifications')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false });
    
    if (unreadOnly) {
      query = query.is('read_at', null);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByUserId(user_id, unreadOnly = false) {
    let query = supabaseClient
      .from('notifications')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    
    if (unreadOnly) {
      query = query.is('read_at', null);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }
  
  static async markAsRead(id) {
    const { data, error } = await supabaseClient
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async markAllAsRead(business_id, user_id = null) {
    let query = supabaseClient
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('business_id', business_id)
      .is('read_at', null);
    
    if (user_id) {
      query = query.eq('user_id', user_id);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data;
  }
  
  static async getUnreadCount(business_id, user_id = null) {
    let query = supabaseClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .is('read_at', null);
    
    if (user_id) {
      query = query.eq('user_id', user_id);
    }
    
    const { count, error } = await query;
    
    if (error) throw error;
    return count || 0;
  }

  static async find(filters = {}) {
    const {
      business_id,
      type,
      unread_only = false,
      limit = 100,
      offset = 0,
    } = filters;

    let query = supabaseClient
      .from('notifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (business_id) query = query.eq('business_id', business_id);
    if (type) query = query.eq('type', type);
    if (unread_only) query = query.is('read_at', null);

    const { data, error, count } = await query;

    if (error) throw error;
    
    return {
      records: data || [],
      total: count || 0,
    };
  }
}
