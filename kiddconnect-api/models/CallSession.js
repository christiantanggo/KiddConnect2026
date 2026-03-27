import { supabaseClient } from '../config/database.js';

export class CallSession {
  static async create(data) {
    const {
      business_id,
      voximplant_call_id,
      vapi_call_id,
      caller_number,
      caller_name,
      status = 'ringing',
      transfer_attempted = false,
      started_at,
    } = data;
    
    // Build insert object, handle missing columns gracefully
    const insertData = {
      business_id,
      voximplant_call_id,
      caller_number,
      caller_name,
      status,
      started_at: started_at || new Date().toISOString(),
    };
    
    // Only add VAPI columns if provided (they may not exist in DB yet)
    if (vapi_call_id !== undefined && vapi_call_id !== null) {
      insertData.vapi_call_id = vapi_call_id;
    }
    if (transfer_attempted !== undefined) {
      insertData.transfer_attempted = transfer_attempted;
    }
    
    console.log('[CallSession Model] Creating call session with data:', insertData);
    
    const { data: session, error } = await supabaseClient
      .from('call_sessions')
      .insert(insertData)
      .select()
      .single();
    
    // If error is about missing columns, try without them
    if (error && (error.message && (error.message.includes('column') || error.message.includes('does not exist')))) {
      console.warn('⚠️ VAPI columns missing, inserting without them. Run RUN_THIS_MIGRATION.sql');
      console.warn('⚠️ Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      
      const fallbackData = {
        business_id,
        voximplant_call_id: voximplant_call_id || null,
        caller_number: caller_number || null,
        caller_name: caller_name || null,
        status: status || 'ringing',
        started_at: started_at || new Date().toISOString(),
      };
      
      console.log('[CallSession Model] Retrying with fallback data:', fallbackData);
      
      const { data: session2, error: error2 } = await supabaseClient
        .from('call_sessions')
        .insert(fallbackData)
        .select()
        .single();
        
      if (error2) {
        console.error('[CallSession Model] ❌ Fallback insert also failed:', error2);
        throw error2;
      }
      
      console.log('[CallSession Model] ✅ Call session created with fallback data:', session2.id);
      return session2;
    }
    
    if (error) {
      console.error('[CallSession Model] ❌ Error creating call session:', error);
      console.error('[CallSession Model] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    
    console.log('[CallSession Model] ✅ Call session created successfully:', session.id);
    return session;
  }
  
  static async findByVoximplantCallId(voximplant_call_id) {
    const { data, error } = await supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('voximplant_call_id', voximplant_call_id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findByVapiCallId(vapi_call_id) {
    try {
      const { data, error } = await supabaseClient
        .from('call_sessions')
        .select('*')
        .eq('vapi_call_id', vapi_call_id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        // If column doesn't exist, return null (migration not run)
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
          console.warn('⚠️ vapi_call_id column missing. Run RUN_THIS_MIGRATION.sql');
          return null;
        }
        throw error;
      }
      return data;
    } catch (err) {
      if (err.message && (err.message.includes('column') || err.message.includes('does not exist'))) {
        console.warn('⚠️ vapi_call_id column missing. Run RUN_THIS_MIGRATION.sql');
        return null;
      }
      throw err;
    }
  }
  
  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    // Remove VAPI columns if they don't exist in DB
    const { data: session, error } = await supabaseClient
      .from('call_sessions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    // If error is about missing columns, try without them
    if (error && error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
      console.warn('⚠️ VAPI columns missing in update, removing them. Run RUN_THIS_MIGRATION.sql');
      const cleanData = { ...updateData };
      delete cleanData.vapi_call_id;
      delete cleanData.transfer_attempted;
      delete cleanData.transfer_successful;
      delete cleanData.transfer_timestamp;
      
      const { data: session2, error: error2 } = await supabaseClient
        .from('call_sessions')
        .update(cleanData)
        .eq('id', id)
        .select()
        .single();
      if (error2) throw error2;
      return session2;
    }
    
    if (error) throw error;
    return session;
  }
  
  static async endCall(id, duration_seconds, transcript, intent, message_taken) {
    return this.update(id, {
      status: 'completed',
      ended_at: new Date().toISOString(),
      duration_seconds,
      transcript,
      intent,
      message_taken,
    });
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findByBusinessId(business_id, limit = 50) {
    const { data, error } = await supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
}
