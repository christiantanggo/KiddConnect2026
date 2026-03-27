import { supabaseClient } from '../config/database.js';

export class SMSOptOut {
  static async create(data) {
    const {
      business_id,
      phone_number,
      reason = 'STOP',
    } = data;
    
    const { data: optOut, error } = await supabaseClient
      .from('sms_opt_outs')
      .insert({
        business_id,
        phone_number,
        reason,
      })
      .select()
      .single();
    
    if (error) {
      // If it's a unique constraint violation, the number is already opted out
      if (error.code === '23505') {
        console.log('[SMSOptOut Model] Phone number already opted out:', phone_number);
        // Return existing opt-out record
        const existing = await this.findByBusinessAndPhone(business_id, phone_number);
        return existing;
      }
      console.error('[SMSOptOut Model] ❌ Error creating opt-out:', error);
      throw error;
    }
    
    return optOut;
  }
  
  static async findByBusinessAndPhone(business_id, phone_number) {
    const { data, error } = await supabaseClient
      .from('sms_opt_outs')
      .select('*')
      .eq('business_id', business_id)
      .eq('phone_number', phone_number)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    return data || null;
  }
  
  static async findByBusinessId(business_id, limit = 100) {
    const { data, error } = await supabaseClient
      .from('sms_opt_outs')
      .select('*')
      .eq('business_id', business_id)
      .order('opted_out_at', { ascending: false })
      .limit(limit);
    
    // Handle missing table gracefully
    if (error) {
      if (error.message && (
        error.message.includes('does not exist') || 
        error.message.includes('relation') ||
        error.code === '42P01' ||
        error.code === 'PGRST116'
      )) {
        console.warn('[SMSOptOut Model] Table does not exist, returning empty array');
        return [];
      }
      throw error;
    }
    return data || [];
  }
  
  static async isOptedOut(business_id, phone_number) {
    const optOut = await this.findByBusinessAndPhone(business_id, phone_number);
    return optOut !== null;
  }
  
  static async remove(business_id, phone_number) {
    const { data, error } = await supabaseClient
      .from('sms_opt_outs')
      .delete()
      .eq('business_id', business_id)
      .eq('phone_number', phone_number)
      .select()
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
}

