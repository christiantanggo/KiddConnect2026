import { supabaseClient } from '../config/database.js';

export class Business {
  static async create(data) {
    const {
      name,
      email,
      phone,
      address,
      timezone = 'America/New_York',
    } = data;
    
    const { data: business, error } = await supabaseClient
      .from('businesses')
      .insert({
        name,
        email,
        phone,
        address,
        timezone,
        // DO NOT set usage_limit_minutes - it must remain NULL until package is purchased
        // This ensures no free minutes are given if payment fails
      })
      .select()
      .single();
    
    if (error) throw error;
    return business;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByEmail(email) {
    const { data, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('email', email)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  /** True if error looks like a missing DB column (e.g. migration not run). */
  static _isMissingColumnError(error) {
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('column') || msg.includes('does not exist') || (error?.code === '42703');
  }

  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    console.log('[Business Model] Updating business:', { id, updateData });
    
    let result = await supabaseClient
      .from('businesses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    let { data: business, error } = result;
    
    // If DB is missing optional columns (migration add_business_address_overrides not run), retry without them
    if (error && this._isMissingColumnError(error)) {
      const fallback = { ...updateData };
      delete fallback.phone_agent_address;
      delete fallback.delivery_default_pickup_address;
      if (Object.keys(fallback).length !== Object.keys(updateData).length) {
        console.warn('[Business Model] Retrying update without phone_agent_address/delivery_default_pickup_address (run migrations/add_business_address_overrides.sql to enable).');
        result = await supabaseClient
          .from('businesses')
          .update(fallback)
          .eq('id', id)
          .select()
          .single();
        business = result.data;
        error = result.error;
      }
    }
    
    if (error) {
      console.error('[Business Model] Update error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    
    console.log('[Business Model] Update successful:', {
      id: business.id,
      name: business.name,
      website: business.website,
      takeout_orders_enabled: business.takeout_orders_enabled,
    });
    
    return business;
  }
  
  static async setOnboardingComplete(id) {
    return this.update(id, { onboarding_complete: true });
  }
  
  static async setVoximplantNumber(id, number) {
    return this.update(id, { voximplant_number: number });
  }

  static async setTelnyxNumber(id, number) {
    return this.update(id, { telnyx_number: number });
  }

  static async findByVapiAssistantId(assistantId) {
    try {
      const { data, error } = await supabaseClient
        .from('businesses')
        .select('*')
        .eq('vapi_assistant_id', assistantId)
        .is('deleted_at', null)
        .single();
      
      // If column doesn't exist, return null (migration not run)
      if (error) {
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
          console.warn('⚠️ vapi_assistant_id column missing. Run RUN_THIS_MIGRATION.sql');
          return null;
        }
        if (error.code !== 'PGRST116') throw error;
      }
      return data;
    } catch (err) {
      if (err.message && (err.message.includes('column') || err.message.includes('does not exist'))) {
        console.warn('⚠️ vapi_assistant_id column missing. Run RUN_THIS_MIGRATION.sql');
        return null;
      }
      throw err;
    }
  }

  static async setVapiAssistant(id, assistantId, phoneNumber) {
    return this.update(id, {
      vapi_assistant_id: assistantId,
      vapi_phone_number: phoneNumber,
      ai_enabled: true,
    });
  }

  static async findByPhoneNumber(phoneNumber) {
    // Normalize phone number for search
    const normalized = phoneNumber.replace(/[^0-9+]/g, '');
    const withPlus = normalized.startsWith('+') ? normalized : `+${normalized}`;
    const withoutPlus = normalized.startsWith('+') ? normalized.substring(1) : normalized;
    
    // First, check business_phone_numbers table (new system)
    try {
      const { BusinessPhoneNumber } = await import('./BusinessPhoneNumber.js');
      const bpn = await BusinessPhoneNumber.findByPhoneNumber(phoneNumber);
      if (bpn && bpn.businesses) {
        return bpn.businesses;
      }
    } catch (error) {
      console.warn('[Business] Error checking business_phone_numbers table:', error.message);
      // Fall through to legacy check
    }
    
    // Fallback to legacy fields (vapi_phone_number and telnyx_number)
    let { data, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .or(`vapi_phone_number.eq.${phoneNumber},vapi_phone_number.eq.${withPlus},vapi_phone_number.eq.${withoutPlus},telnyx_number.eq.${phoneNumber},telnyx_number.eq.${withPlus},telnyx_number.eq.${withoutPlus}`)
      .is('deleted_at', null)
      .limit(1);
    
    if (error && error.code !== 'PGRST116') throw error;
    return data && data.length > 0 ? data[0] : null;
  }

  static async findByStripeCustomerId(customerId) {
    try {
      const { data, error } = await supabaseClient
        .from('businesses')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .is('deleted_at', null)
        .single();
      
      if (error) {
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
          console.warn('⚠️ stripe_customer_id column missing. Run migrations/add_stripe_fields.sql');
          return null;
        }
        if (error.code !== 'PGRST116') throw error;
      }
      return data;
    } catch (err) {
      if (err.message && (err.message.includes('column') || err.message.includes('does not exist'))) {
        console.warn('⚠️ stripe_customer_id column missing. Run migrations/add_stripe_fields.sql');
        return null;
      }
      throw err;
    }
  }
}
