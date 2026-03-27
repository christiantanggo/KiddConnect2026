import { supabaseClient } from '../../config/database.js';

export class ReviewsOutput {
  static async create(data) {
    const {
      business_id,
      user_id,
      module_key = 'reviews',
      prompt_type = 'reviews.reply',
      input,
      output,
    } = data;
    
    const { data: reviewOutput, error } = await supabaseClient
      .from('reviews_outputs')
      .insert({
        business_id,
        user_id,
        module_key,
        prompt_type,
        input,
        output,
      })
      .select()
      .single();
    
    if (error) throw error;
    return reviewOutput;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('reviews_outputs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByBusinessId(businessId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'desc'
    } = options;
    
    let query = supabaseClient
      .from('reviews_outputs')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order(orderBy, { ascending: orderDirection === 'asc' })
      .range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    return {
      records: data || [],
      total: count || 0,
      limit,
      offset
    };
  }
  
  static async findByUserId(userId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'desc'
    } = options;
    
    let query = supabaseClient
      .from('reviews_outputs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order(orderBy, { ascending: orderDirection === 'asc' })
      .range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    return {
      records: data || [],
      total: count || 0,
      limit,
      offset
    };
  }
  
  static async delete(id) {
    const { error } = await supabaseClient
      .from('reviews_outputs')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { success: true };
  }

  static async updateAnalysis(id, analysisData) {
    const { error } = await supabaseClient
      .from('reviews_outputs')
      .update({
        ...analysisData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
    return { success: true };
  }

  static async incrementLikeCount(id) {
    // Get current value
    const { data: current } = await supabaseClient
      .from('reviews_outputs')
      .select('like_count')
      .eq('id', id)
      .single();
    
    const { error } = await supabaseClient
      .from('reviews_outputs')
      .update({
        like_count: (current?.like_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
    return { success: true };
  }

  static async incrementRegenerateCount(id) {
    // Get current value
    const { data: current } = await supabaseClient
      .from('reviews_outputs')
      .select('regenerate_count')
      .eq('id', id)
      .single();
    
    const { error } = await supabaseClient
      .from('reviews_outputs')
      .update({
        regenerate_count: (current?.regenerate_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
    return { success: true };
  }
}

