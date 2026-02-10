import { supabaseClient } from '../../config/database.js';

export class AIRequest {
  static async create(data) {
    const {
      business_id,
      user_id,
      module_key,
      prompt_type,
      input,
      output,
      tokens_used,
      model,
    } = data;
    
    const { data: request, error } = await supabaseClient
      .from('ai_requests')
      .insert({
        business_id,
        user_id,
        module_key,
        prompt_type,
        input,
        output,
        tokens_used,
        model,
      })
      .select()
      .single();
    
    if (error) throw error;
    return request;
  }
  
  static async findByBusinessAndModule(business_id, module_key, limit = 50) {
    const { data, error } = await supabaseClient
      .from('ai_requests')
      .select('*')
      .eq('business_id', business_id)
      .eq('module_key', module_key)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
  
  static async getTotalTokens(business_id, module_key, startDate, endDate) {
    let query = supabaseClient
      .from('ai_requests')
      .select('tokens_used')
      .eq('business_id', business_id)
      .eq('module_key', module_key)
      .not('tokens_used', 'is', null);
    
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('created_at', endDate);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    const total = (data || []).reduce((sum, req) => sum + (req.tokens_used || 0), 0);
    
    return total;
  }
}




