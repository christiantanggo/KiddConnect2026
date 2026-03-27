import { supabaseClient } from '../config/database.js';

export class SMSCampaign {
  static async create(data) {
    const {
      business_id,
      name,
      message_text,
      total_recipients,
    } = data;
    
    const { data: campaign, error } = await supabaseClient
      .from('sms_campaigns')
      .insert({
        business_id,
        name,
        message_text,
        total_recipients,
        status: 'pending',
      })
      .select()
      .single();
    
    if (error) {
      console.error('[SMSCampaign Model] ❌ Error creating campaign:', error);
      throw error;
    }
    
    return campaign;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('sms_campaigns')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async findByBusinessId(business_id, limit = 50) {
    const { data, error } = await supabaseClient
      .from('sms_campaigns')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    // Handle missing table gracefully
    if (error) {
      if (error.message && (
        error.message.includes('does not exist') || 
        error.message.includes('relation') ||
        error.code === '42P01' ||
        error.code === 'PGRST116'
      )) {
        console.warn('[SMSCampaign Model] Table does not exist, returning empty array');
        return [];
      }
      throw error;
    }
    return data || [];
  }
  
  static async update(id, updates) {
    const { data, error } = await supabaseClient
      .from('sms_campaigns')
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
  
  static async updateStatus(id, status, additionalData = {}) {
    const updates = {
      status,
      updated_at: new Date().toISOString(),
      ...additionalData,
    };
    
    if (status === 'processing' && !additionalData.started_at) {
      updates.started_at = new Date().toISOString();
    }
    
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updates.completed_at = new Date().toISOString();
    }
    
    return this.update(id, updates);
  }
  
  static async incrementSentCount(id, count = 1) {
    const campaign = await this.findById(id);
    const newSentCount = (campaign.sent_count || 0) + count;
    return this.update(id, { sent_count: newSentCount });
  }
  
  static async incrementFailedCount(id, count = 1) {
    const campaign = await this.findById(id);
    const newFailedCount = (campaign.failed_count || 0) + count;
    return this.update(id, { failed_count: newFailedCount });
  }
}

