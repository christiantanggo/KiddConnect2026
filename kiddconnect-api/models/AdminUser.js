// models/AdminUser.js
// Admin user model for Tavari staff

import { supabaseClient } from "../config/database.js";
import { hashPassword, comparePassword } from "../utils/auth.js";

export class AdminUser {
  static async create(data) {
    const {
      email,
      password,
      first_name,
      last_name,
      role = "support",
    } = data;

    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const password_hash = await hashPassword(password);

    const { data: admin, error } = await supabaseClient
      .from("admin_users")
      .insert({
        email,
        password_hash,
        first_name,
        last_name,
        role,
      })
      .select()
      .single();

    if (error) throw error;
    return admin;
  }

  static async findById(id) {
    const { data, error } = await supabaseClient
      .from("admin_users")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  }

  static async findByEmail(email) {
    const { data, error } = await supabaseClient
      .from("admin_users")
      .select("*")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  }

  static async verifyPassword(admin, password) {
    return comparePassword(password, admin.password_hash);
  }

  static async updateLastLogin(id) {
    const { data, error } = await supabaseClient
      .from("admin_users")
      .update({ last_login: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}



















