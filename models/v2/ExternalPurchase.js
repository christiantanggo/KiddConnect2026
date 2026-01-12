import { supabaseClient } from '../../config/database.js';

export class ExternalPurchase {
  static async create(data) {
    const {
      provider = 'clickbank',
      external_order_id,
      business_id,
      user_id,
      module_key,
      email,
      amount,
      currency = 'USD',
      status = 'active',
      purchase_data,
    } = data;
    
    const { data: purchase, error } = await supabaseClient
      .from('external_purchases')
      .insert({
        provider,
        external_order_id,
        business_id,
        user_id,
        module_key,
        email,
        amount,
        currency,
        status,
        purchase_data,
      })
      .select()
      .single();
    
    if (error) throw error;
    return purchase;
  }
  
  static async findByExternalOrderId(provider, external_order_id) {
    const { data, error } = await supabaseClient
      .from('external_purchases')
      .select('*')
      .eq('provider', provider)
      .eq('external_order_id', external_order_id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByEmail(email) {
    const { data, error } = await supabaseClient
      .from('external_purchases')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    const { data: purchase, error } = await supabaseClient
      .from('external_purchases')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return purchase;
  }
  
  static async updateStatus(id, status) {
    return await this.update(id, { status });
  }
}

