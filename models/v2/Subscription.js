import { supabaseClient } from '../../config/database.js';

export class Subscription {
  static async create(data) {
    const {
      business_id,
      module_key,
      plan,
      status,
      stripe_subscription_item_id,
      usage_limit,
      usage_limit_reset_date,
      started_at,
      ends_at,
      trial_ends_at,
    } = data;
    
    const { data: subscription, error } = await supabaseClient
      .from('subscriptions')
      .insert({
        business_id,
        module_key,
        plan,
        status,
        stripe_subscription_item_id,
        usage_limit,
        usage_limit_reset_date,
        started_at: started_at || new Date().toISOString(),
        ends_at,
        trial_ends_at,
      })
      .select()
      .single();
    
    if (error) throw error;
    return subscription;
  }
  
  static async findByBusinessAndModule(business_id, module_key) {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('business_id', business_id)
      .eq('module_key', module_key)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByBusinessId(business_id) {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    const { data: subscription, error } = await supabaseClient
      .from('subscriptions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return subscription;
  }
  
  static async updateStatus(business_id, module_key, status) {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('business_id', business_id)
      .eq('module_key', module_key)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async findActiveByBusinessId(business_id) {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('business_id', business_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
}




