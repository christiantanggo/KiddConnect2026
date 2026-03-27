import { supabaseClient } from '../config/database.js';

export class SMSCampaignRecipient {
  static async create(data) {
    const {
      campaign_id,
      phone_number,
      email,
      first_name,
      last_name,
      status = 'pending',
    } = data;
    
    const { data: recipient, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .insert({
        campaign_id,
        phone_number,
        email: email || null,
        first_name: first_name || null,
        last_name: last_name || null,
        status,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[SMSCampaignRecipient Model] ❌ Error creating recipient:', error);
      throw error;
    }
    
    return recipient;
  }
  
  static async createBatch(recipients) {
    if (!recipients || recipients.length === 0) {
      return [];
    }
    
    const { data, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .insert(recipients)
      .select();
    
    if (error) {
      console.error('[SMSCampaignRecipient Model] ❌ Error creating recipients batch:', error);
      throw error;
    }
    
    return data || [];
  }
  
  static async findByCampaignId(campaign_id) {
    const { data, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .select('*')
      .eq('campaign_id', campaign_id)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByCampaignIdAndStatus(campaign_id, status) {
    const { data, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .select('*')
      .eq('campaign_id', campaign_id)
      .eq('status', status)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Find all queued recipients ready to send (scheduled_send_at <= now)
   * @returns {Promise<Array>} Array of recipient records ready to send
   */
  static async findReadyToSend() {
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .select('*')
      .eq('status', 'queued')
      .lte('scheduled_send_at', now)
      .order('scheduled_send_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Find queued recipients for a specific campaign
   * @param {string} campaign_id - Campaign ID
   * @returns {Promise<Array>} Array of queued recipient records
   */
  static async findQueuedByCampaignId(campaign_id) {
    const { data, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .select('*')
      .eq('campaign_id', campaign_id)
      .eq('status', 'queued')
      .order('scheduled_send_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
  
  static async updateStatus(id, status, additionalData = {}) {
    const updates = {
      status,
      ...additionalData,
    };
    
    if (status === 'sent' && !additionalData.sent_at) {
      updates.sent_at = new Date().toISOString();
    }
    
    const { data, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Find recipient by Telnyx message ID
   * @param {string} telnyx_message_id - Telnyx message ID
   * @returns {Promise<Object|null>} Recipient record or null
   */
  static async findByTelnyxMessageId(telnyx_message_id) {
    if (!telnyx_message_id) return null;
    
    const { data, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .select('*')
      .eq('telnyx_message_id', telnyx_message_id)
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    
    return data;
  }

  /**
   * Find recipient by phone number and campaign ID
   * @param {string} campaign_id - Campaign ID
   * @param {string} phone_number - Phone number (E.164 format)
   * @returns {Promise<Object|null>} Recipient record or null
   */
  static async findByCampaignAndPhone(campaign_id, phone_number) {
    if (!campaign_id || !phone_number) return null;
    
    const { data, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .select('*')
      .eq('campaign_id', campaign_id)
      .eq('phone_number', phone_number)
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    
    return data;
  }

  static async getCampaignStats(campaign_id) {
    const { data, error } = await supabaseClient
      .from('sms_campaign_recipients')
      .select('status')
      .eq('campaign_id', campaign_id);
    
    // Handle missing table gracefully
    if (error) {
      if (error.message && (
        error.message.includes('does not exist') || 
        error.message.includes('relation') ||
        error.code === '42P01' ||
        error.code === 'PGRST116'
      )) {
        console.warn('[SMSCampaignRecipient Model] Table does not exist, returning empty stats');
        return {
          total: 0,
          pending: 0,
          sent: 0,
          failed: 0,
        };
      }
      throw error;
    }
    
    const stats = {
      total: data.length,
      pending: 0,
      sent: 0,
      failed: 0,
    };
    
    data.forEach(recipient => {
      if (recipient.status === 'pending') stats.pending++;
      else if (recipient.status === 'sent') stats.sent++;
      else if (recipient.status === 'failed') stats.failed++;
    });
    
    return stats;
  }
}

