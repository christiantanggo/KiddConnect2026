// models/BusinessPhoneNumber.js
// Model for managing multiple phone numbers per business

import { supabaseClient } from '../config/database.js';

export class BusinessPhoneNumber {
  /**
   * Get all phone numbers for a business
   * @param {string} businessId - Business ID
   * @param {boolean} activeOnly - Only return active numbers (default: false)
   * @returns {Promise<Array>} Array of phone number objects
   */
  static async findByBusinessId(businessId, activeOnly = false) {
    try {
      let query = supabaseClient
        .from('business_phone_numbers')
        .select('*')
        .eq('business_id', businessId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[BusinessPhoneNumber] Error finding by business ID:', error);
      throw error;
    }
  }

  /**
   * Get primary phone number for a business
   * @param {string} businessId - Business ID
   * @returns {Promise<Object|null>} Primary phone number object or null
   */
  static async findPrimaryByBusinessId(businessId) {
    try {
      const { data, error } = await supabaseClient
        .from('business_phone_numbers')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_primary', true)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      console.error('[BusinessPhoneNumber] Error finding primary number:', error);
      return null;
    }
  }

  /**
   * Get all active phone numbers for a business
   * @param {string} businessId - Business ID
   * @returns {Promise<Array>} Array of active phone numbers
   */
  static async findActiveByBusinessId(businessId) {
    return this.findByBusinessId(businessId, true);
  }

  /**
   * Add a phone number to a business
   * @param {string} businessId - Business ID
   * @param {string} phoneNumber - Phone number in E.164 format
   * @param {boolean} isPrimary - Whether this should be the primary number (default: false)
   * @returns {Promise<Object>} Created phone number object
   */
  static async create(businessId, phoneNumber, isPrimary = false) {
    try {
      // Normalize phone number
      let normalized = phoneNumber.replace(/[^0-9+]/g, '').trim();
      if (!normalized.startsWith('+')) {
        normalized = '+' + normalized;
      }

      // If this is set as primary, unset other primary numbers
      if (isPrimary) {
        await supabaseClient
          .from('business_phone_numbers')
          .update({ is_primary: false })
          .eq('business_id', businessId);
      }

      const { data, error } = await supabaseClient
        .from('business_phone_numbers')
        .insert({
          business_id: businessId,
          phone_number: normalized,
          is_primary: isPrimary,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[BusinessPhoneNumber] Error creating:', error);
      throw error;
    }
  }

  /**
   * Remove a phone number from a business (soft delete by setting is_active = false)
   * @param {string} id - Phone number record ID
   * @returns {Promise<Object>} Updated phone number object
   */
  static async remove(id) {
    try {
      const { data, error } = await supabaseClient
        .from('business_phone_numbers')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[BusinessPhoneNumber] Error removing:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a phone number record
   * @param {string} id - Phone number record ID
   * @returns {Promise<void>}
   */
  static async delete(id) {
    try {
      const { error } = await supabaseClient
        .from('business_phone_numbers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[BusinessPhoneNumber] Error deleting:', error);
      throw error;
    }
  }

  /**
   * Set a phone number as primary
   * @param {string} id - Phone number record ID
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Updated phone number object
   */
  static async setPrimary(id, businessId) {
    try {
      // Unset all other primary numbers for this business
      await supabaseClient
        .from('business_phone_numbers')
        .update({ is_primary: false })
        .eq('business_id', businessId);

      // Set this one as primary
      const { data, error } = await supabaseClient
        .from('business_phone_numbers')
        .update({ 
          is_primary: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[BusinessPhoneNumber] Error setting primary:', error);
      throw error;
    }
  }

  /**
   * Find business by phone number
   * @param {string} phoneNumber - Phone number to search for
   * @returns {Promise<Object|null>} Business phone number record or null
   */
  static async findByPhoneNumber(phoneNumber) {
    try {
      // Normalize phone number
      let normalized = phoneNumber.replace(/[^0-9+]/g, '').trim();
      if (!normalized.startsWith('+')) {
        normalized = '+' + normalized;
      }

      const { data, error } = await supabaseClient
        .from('business_phone_numbers')
        .select('*, businesses(*)')
        .eq('phone_number', normalized)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      console.error('[BusinessPhoneNumber] Error finding by phone number:', error);
      return null;
    }
  }
}

