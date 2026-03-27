import { supabaseClient } from '../config/database.js';

export class AIAgent {
  static async create(data) {
    const {
      business_id,
      name = 'AI Assistant',
      greeting_text,
      business_hours = {},
      faqs = [],
      message_settings = {},
      voice_settings = {},
      system_instructions,
    } = data;
    
    const { data: agent, error } = await supabaseClient
      .from('ai_agents')
      .insert({
        business_id,
        name,
        greeting_text,
        business_hours,
        faqs,
        message_settings,
        voice_settings,
        system_instructions,
      })
      .select()
      .single();
    
    if (error) throw error;
    return agent;
  }
  
  static async findByBusinessId(business_id) {
    const { data, error } = await supabaseClient
      .from('ai_agents')
      .select('*')
      .eq('business_id', business_id)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async update(business_id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    console.log('[AIAgent Model] ========== UPDATING AI AGENT ==========');
    console.log('[AIAgent Model] Business ID:', business_id);
    console.log('[AIAgent Model] Update data (keys):', Object.keys(updateData));
    if (updateData.business_hours) {
      console.log('[AIAgent Model] business_hours being saved:', JSON.stringify(updateData.business_hours, null, 2));
    }
    
    const { data: agent, error } = await supabaseClient
      .from('ai_agents')
      .update(updateData)
      .eq('business_id', business_id)
      .select()
      .single();
    
    if (error) {
      console.error('[AIAgent Model] ❌ Error updating agent:', error);
      console.error('[AIAgent Model] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    
    console.log('[AIAgent Model] ✅ Agent updated successfully');
    if (agent.business_hours) {
      console.log('[AIAgent Model] Saved business_hours:', JSON.stringify(agent.business_hours, null, 2));
    }
    console.log('[AIAgent Model] ===============================================');
    
    return agent;
  }
}
