// models/PricingPackage.js
// Pricing package model

import { supabaseClient } from '../config/database.js';

export class PricingPackage {
  static async create(data) {
    const {
      name,
      description,
      monthly_price,
      minutes_included = 0,
      overage_price_per_minute = 0,
      sms_included = 0,
      sms_overage_price = 0,
      emails_included = 0,
      emails_overage_price = 0,
      max_faqs = 5,
      stripe_product_id,
      stripe_price_id,
      is_active = true,
      is_public = true,
      sale_name,
      sale_start_date,
      sale_end_date,
      sale_max_quantity,
      sale_sold_count = 0,
      sale_price,
      sale_duration_months,
      module_key = 'phone-agent',
      prompts_included = 0,
      is_clickbank_package = false,
      clickbank_commission_rate = null,
    } = data;

    if (!name || !monthly_price) {
      throw new Error('Name and monthly price are required');
    }

    const insertData = {
      name,
      description,
      monthly_price,
      minutes_included,
      overage_price_per_minute,
      sms_included,
      sms_overage_price,
      emails_included,
      emails_overage_price,
      max_faqs,
      stripe_product_id,
      stripe_price_id,
      is_active,
      is_public,
      module_key,
      prompts_included,
      is_clickbank_package,
      clickbank_commission_rate,
      updated_at: new Date().toISOString(),
    };
    
    // Add sale fields if provided
    if (sale_name !== undefined) insertData.sale_name = sale_name;
    if (sale_start_date !== undefined) insertData.sale_start_date = sale_start_date;
    if (sale_end_date !== undefined) insertData.sale_end_date = sale_end_date;
    if (sale_max_quantity !== undefined) insertData.sale_max_quantity = sale_max_quantity;
    if (sale_sold_count !== undefined) insertData.sale_sold_count = sale_sold_count;
    if (sale_price !== undefined) insertData.sale_price = sale_price;
    if (sale_duration_months !== undefined) insertData.sale_duration_months = sale_duration_months;
    
    const { data: pkg, error } = await supabaseClient
      .from('pricing_packages')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return pkg;
  }

  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('pricing_packages')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findAll(options = {}) {
    const { includeInactive = false, includePrivate = false, moduleKey = null } = options;
    
    let query = supabaseClient
      .from('pricing_packages')
      .select('*')
      .is('deleted_at', null);

    if (moduleKey) {
      query = query.eq('module_key', moduleKey);
    }

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    if (!includePrivate) {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query.order('monthly_price', { ascending: true });

    if (error) throw error;
    
    // Add sale status to each package
    const packages = (data || []).map(pkg => {
      const isOnSale = PricingPackage.isSaleActive(pkg);
      const saleAvailable = PricingPackage.isSaleAvailable(pkg);
      return {
        ...pkg,
        isOnSale,
        saleAvailable,
      };
    });
    
    return packages;
  }

  /**
   * Check if a sale is currently active for a package
   * Sale is active if:
   * - Has sale_name
   * - Current date is after sale_start_date (if set)
   * - Current date is before sale_end_date (if set)
   * - Not sold out (if max_quantity is set)
   */
  static isSaleActive(pkg) {
    if (!pkg.sale_name) {
      return false;
    }
    
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    
    // Check start date (if set)
    if (pkg.sale_start_date) {
      const startDate = new Date(pkg.sale_start_date);
      startDate.setHours(0, 0, 0, 0);
      if (now < startDate) {
        return false; // Sale hasn't started yet
      }
    }
    
    // Check end date (if set - optional for quantity-only sales)
    if (pkg.sale_end_date) {
      const endDate = new Date(pkg.sale_end_date);
      endDate.setHours(23, 59, 59, 999); // End of sale end date
      if (now > endDate) {
        return false; // Sale has ended
      }
    }
    
    return true;
  }

  /**
   * Check if a sale is available (active and not sold out)
   */
  static isSaleAvailable(pkg) {
    if (!PricingPackage.isSaleActive(pkg)) {
      return false;
    }
    
    // If max_quantity is null, sale is unlimited
    if (pkg.sale_max_quantity === null || pkg.sale_max_quantity === undefined) {
      return true;
    }
    
    const soldCount = pkg.sale_sold_count || 0;
    return soldCount < pkg.sale_max_quantity;
  }

  /**
   * Increment the sale sold count when a package is purchased during a sale
   */
  static async incrementSaleCount(packageId) {
    const pkg = await PricingPackage.findById(packageId);
    if (!pkg || !PricingPackage.isSaleActive(pkg)) {
      return;
    }
    
    const newCount = (pkg.sale_sold_count || 0) + 1;
    await PricingPackage.update(packageId, { sale_sold_count: newCount });
  }

  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    const { data: pkg, error } = await supabaseClient
      .from('pricing_packages')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return pkg;
  }

  static async delete(id) {
    const { data, error } = await supabaseClient
      .from('pricing_packages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getBusinessCount(packageId) {
    const { count, error } = await supabaseClient
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('package_id', packageId)
      .is('deleted_at', null);

    if (error) throw error;
    return count || 0;
  }

  static async getBusinesses(packageId) {
    const { data, error } = await supabaseClient
      .from('businesses')
      .select('id, name, email, created_at, ai_enabled')
      .eq('package_id', packageId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Find the ClickBank package for a specific module
   */
  static async findClickBankPackage(moduleKey) {
    const { data, error } = await supabaseClient
      .from('pricing_packages')
      .select('*')
      .eq('module_key', moduleKey)
      .eq('is_clickbank_package', true)
      .is('deleted_at', null)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Check if another ClickBank package exists for the same module (excluding the current package)
   */
  static async hasOtherClickBankPackage(moduleKey, excludePackageId) {
    let query = supabaseClient
      .from('pricing_packages')
      .select('id')
      .eq('module_key', moduleKey)
      .eq('is_clickbank_package', true)
      .is('deleted_at', null);

    if (excludePackageId) {
      query = query.neq('id', excludePackageId);
    }

    const { data, error } = await query.limit(1);

    if (error) throw error;
    return (data && data.length > 0) || false;
  }
}

