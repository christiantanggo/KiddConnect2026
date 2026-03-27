// models/InvoiceSettings.js
// Invoice settings model (singleton - only one row)

import { supabaseClient } from '../config/database.js';

export class InvoiceSettings {
  // Get invoice settings (singleton - always get the first/only row)
  static async get() {
    const { data, error } = await supabaseClient
      .from('invoice_settings')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // Update invoice settings (updates the only row or creates if doesn't exist)
  static async update(settings) {
    const existing = await this.get();
    
    if (existing) {
      // Update existing
      const { data, error } = await supabaseClient
        .from('invoice_settings')
        .update({
          ...settings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Create new (shouldn't happen if migration ran, but handle it)
      const { data, error } = await supabaseClient
        .from('invoice_settings')
        .insert({
          ...settings,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  }
}

