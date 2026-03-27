import { supabaseClient } from '../config/database.js';

export class Message {
  static async create(data) {
    const {
      business_id,
      call_session_id,
      caller_name,
      caller_phone,
      caller_email,
      message_text,
      reason,
    } = data;
    
    // Ensure required fields are not empty
    const insertData = {
      business_id,
      call_session_id: call_session_id || null,
      caller_name: caller_name || null,
      caller_phone: caller_phone || 'unknown', // Required field - use 'unknown' if empty
      caller_email: caller_email || null,
      message_text: message_text || 'No message provided',
      reason: reason || null,
      status: 'new', // Explicitly set status
    };
    
    console.log('[Message Model] Creating message with data:', {
      ...insertData,
      message_text: insertData.message_text.substring(0, 100) + '...',
    });
    
    const { data: message, error } = await supabaseClient
      .from('messages')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      console.error('[Message Model] ❌ Error creating message:', error);
      console.error('[Message Model] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    
    console.log('[Message Model] ✅ Message created successfully:', message.id);
    return message;
  }
  
  static async findByBusinessId(business_id, limit = 50) {
    const { data, error } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('business_id', business_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
  
  static async markAsRead(id) {
    const { data, error } = await supabaseClient
      .from('messages')
      .update({ 
        is_read: true,
        status: 'read',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async markAsFollowUp(id) {
    const { data, error } = await supabaseClient
      .from('messages')
      .update({ 
        status: 'follow_up',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}
