// models/AdminActivityLog.js
// Admin activity log model

import { supabaseClient } from "../config/database.js";

export class AdminActivityLog {
  static async create(data) {
    const {
      admin_user_id,
      business_id,
      action,
      details = {},
    } = data;

    const { data: log, error } = await supabaseClient
      .from("admin_activity_log")
      .insert({
        admin_user_id,
        business_id,
        action,
        details,
      })
      .select()
      .single();

    if (error) throw error;
    return log;
  }

  static async findByAdmin(adminUserId, limit = 100) {
    const { data, error } = await supabaseClient
      .from("admin_activity_log")
      .select("*")
      .eq("admin_user_id", adminUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  static async findByBusiness(businessId, limit = 100) {
    const { data, error } = await supabaseClient
      .from("admin_activity_log")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }
}
















