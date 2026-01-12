// routes/admin.js
// Admin API routes for Tavari staff

import express from "express";
import { authenticateAdmin } from "../middleware/adminAuth.js";
import { AdminUser } from "../models/AdminUser.js";
import { AdminActivityLog } from "../models/AdminActivityLog.js";
import { Business } from "../models/Business.js";
import { PricingPackage } from "../models/PricingPackage.js";
import { generateToken } from "../utils/auth.js";
import { hashPassword } from "../utils/auth.js";
import { sendSupportTicketUpdateNotification } from "../services/notifications.js";

const router = express.Router();

// Admin login
router.post("/login", async (req, res) => {
  try {
    console.log('[Admin Login] ========== LOGIN ATTEMPT START ==========');
    console.log('[Admin Login] Email:', req.body.email);
    
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('[Admin Login] ❌ Missing email or password');
      return res.status(400).json({ error: "Email and password are required" });
    }

    console.log('[Admin Login] Looking up admin user...');
    const admin = await AdminUser.findByEmail(email);
    if (!admin) {
      console.log('[Admin Login] ❌ Admin not found for email:', email);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log('[Admin Login] ✅ Admin found, verifying password...');
    const isValid = await AdminUser.verifyPassword(admin, password);
    if (!isValid) {
      console.log('[Admin Login] ❌ Invalid password');
      return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log('[Admin Login] ✅ Password valid, updating last login...');
    await AdminUser.updateLastLogin(admin.id);

    const token = generateToken({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
    });

    console.log('[Admin Login] ✅ Login successful, token generated');
    console.log('[Admin Login] ========== LOGIN ATTEMPT COMPLETE ==========');

    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        first_name: admin.first_name,
        last_name: admin.last_name,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("[Admin Login] ========== LOGIN ERROR ==========");
    console.error("Admin login error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: "Failed to login" });
  }
});

// Get current admin user
router.get("/me", authenticateAdmin, async (req, res) => {
  try {
    res.json({
      admin: {
        id: req.admin.id,
        email: req.admin.email,
        first_name: req.admin.first_name,
        last_name: req.admin.last_name,
        role: req.admin.role,
      },
    });
  } catch (error) {
    console.error("Get admin me error:", error);
    res.status(500).json({ error: "Failed to get admin info" });
  }
});

// Get all modules (admin version - no business context needed)
router.get("/modules", authenticateAdmin, async (req, res) => {
  try {
    const { Module } = await import('../models/v2/Module.js');
    const modules = await Module.findAll();
    res.json({ modules });
  } catch (error) {
    console.error('[GET /api/admin/modules] Error:', error);
    // Return fallback modules if error
    res.json({ 
      modules: [
        { key: 'phone-agent', name: 'Tavari AI Phone Agent', description: 'AI phone answering and call management', is_active: true },
        { key: 'reviews', name: 'Tavari AI Review Reply', description: 'AI-powered review response generation', is_active: true },
      ]
    });
  }
});

// Get all businesses (with search/filter)
router.get("/accounts", authenticateAdmin, async (req, res) => {
  try {
    const { search, plan_tier, status } = req.query;
    const { supabaseClient } = await import("../config/database.js");
    
    let query = supabaseClient.from("businesses").select("*").is("deleted_at", null);
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    
    if (plan_tier) {
      query = query.eq("plan_tier", plan_tier);
    }
    
    if (status === "active") {
      query = query.eq("ai_enabled", true);
    } else if (status === "inactive") {
      query = query.eq("ai_enabled", false);
    }
    
    const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
    
    if (error) throw error;
    
    res.json({ businesses: data || [] });
  } catch (error) {
    console.error("Get accounts error:", error);
    res.status(500).json({ error: "Failed to get accounts" });
  }
});

// Get business details
router.get("/accounts/:id", authenticateAdmin, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    res.json({ business });
  } catch (error) {
    console.error("Get account error:", error);
    res.status(500).json({ error: "Failed to get account" });
  }
});

// Add bonus minutes
router.post("/accounts/:id/minutes", authenticateAdmin, async (req, res) => {
  try {
    const { minutes } = req.body;
    const business = await Business.findById(req.params.id);
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    const newBonusMinutes = (business.bonus_minutes || 0) + parseInt(minutes);
    await Business.update(req.params.id, { bonus_minutes: newBonusMinutes });
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: req.params.id,
      action: "add_bonus_minutes",
      details: { minutes, total: newBonusMinutes },
    });
    
    res.json({ success: true, bonus_minutes: newBonusMinutes });
  } catch (error) {
    console.error("Add minutes error:", error);
    res.status(500).json({ error: "Failed to add minutes" });
  }
});

// Set custom pricing
router.post("/accounts/:id/pricing", authenticateAdmin, async (req, res) => {
  try {
    const { monthly, overage } = req.body;
    const business = await Business.findById(req.params.id);
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    await Business.update(req.params.id, {
      custom_pricing_monthly: monthly ? parseFloat(monthly) : null,
      custom_pricing_overage: overage ? parseFloat(overage) : null,
    });
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: req.params.id,
      action: "set_custom_pricing",
      details: { monthly, overage },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Set pricing error:", error);
    res.status(500).json({ error: "Failed to set pricing" });
  }
});

// Remove VAPI phone number from business
router.post("/accounts/:id/remove-phone", authenticateAdmin, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Update business to remove phone number
    await Business.update(req.params.id, {
      vapi_phone_number: null,
    });

    // Log admin activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: req.params.id,
      action: "remove_phone_number",
      details: { 
        removed_phone_number: business.vapi_phone_number,
      },
    });

    res.json({ success: true, message: "Phone number removed successfully" });
  } catch (error) {
    console.error("Remove phone number error:", error);
    res.status(500).json({ error: "Failed to remove phone number" });
  }
});

// Retry activation
router.post("/accounts/:id/retry-activation", authenticateAdmin, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    // Retry VAPI activation
    const { createAssistant, provisionPhoneNumber, linkAssistantToNumber } = await import("../services/vapi.js");
    const agent = await AIAgent.findByBusinessId(business.id);
    
    const assistant = await createAssistant({
      name: business.name,
      public_phone_number: business.public_phone_number || "",
      timezone: business.timezone,
      business_hours: agent?.business_hours || {},
      faqs: agent?.faqs || [],
      contact_email: business.email,
      address: business.address || "",
      allow_call_transfer: business.allow_call_transfer ?? true,
      ai_enabled: business.ai_enabled ?? true, // Include ai_enabled to set greeting delay
      businessId: business.id, // CRITICAL: Include businessId in metadata for webhook lookup
    });
    
    const phoneNumber = await provisionPhoneNumber();
    await linkAssistantToNumber(assistant.id, phoneNumber.id);
    await Business.setVapiAssistant(business.id, assistant.id, phoneNumber.phoneNumber);
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: req.params.id,
      action: "retry_activation",
      details: { assistant_id: assistant.id, phone_number: phoneNumber.phoneNumber },
    });
    
    res.json({ success: true, phone_number: phoneNumber.phoneNumber });
  } catch (error) {
    console.error("Retry activation error:", error);
    res.status(500).json({ error: "Failed to retry activation" });
  }
});

// Get usage stats for a business
router.get("/accounts/:id/usage", authenticateAdmin, async (req, res) => {
  try {
    const { UsageMinutes } = await import("../models/UsageMinutes.js");
    const { calculateBillingCycle } = await import("../services/billing.js");
    const { getCurrentCycleUsage } = await import("../services/usage.js");
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    // Initialize billing cycle if not set
    if (!business.billing_day || !business.next_billing_date) {
      const { initializeBillingCycle } = await import("../services/billing.js");
      await initializeBillingCycle(business.id, business.created_at || new Date());
      // Reload business to get updated billing info
      const updatedBusiness = await Business.findById(req.params.id);
      Object.assign(business, updatedBusiness);
    }
    
    // Get current billing cycle
    const billingCycle = calculateBillingCycle(business);
    
    // Get current billing cycle usage (same as customer side)
    const usage = await getCurrentCycleUsage(req.params.id, billingCycle.start, billingCycle.end);
    
    // Get minutes from package if business has one, otherwise use business.usage_limit_minutes
    let planLimit = business.usage_limit_minutes || 0;
    
    if (business.package_id) {
      const { PricingPackage } = await import("../models/PricingPackage.js");
      const pkg = await PricingPackage.findById(business.package_id);
      
      if (pkg) {
        // Use package minutes
        planLimit = pkg.minutes_included || 0;
        
        // Sync business.usage_limit_minutes with package if they don't match
        if (business.usage_limit_minutes !== pkg.minutes_included) {
          await Business.update(business.id, {
            usage_limit_minutes: pkg.minutes_included,
          });
        }
      }
    }
    
    // Format response same as customer side
    const bonusMinutes = business.bonus_minutes || 0;
    const totalAvailable = planLimit + bonusMinutes;
    const minutesRemaining = Math.max(0, totalAvailable - usage.totalMinutes);
    const usagePercent = totalAvailable > 0 ? (usage.totalMinutes / totalAvailable) * 100 : 0;
    
    const formattedUsage = {
      minutes_used: usage.totalMinutes || 0,
      minutes_total: totalAvailable,
      minutes_remaining: minutesRemaining,
      usage_percent: Math.round(usagePercent),
      overage_minutes: usage.overageMinutes || 0,
      billing_cycle_start: billingCycle.start.toISOString().split('T')[0],
      billing_cycle_end: billingCycle.end.toISOString().split('T')[0],
      next_billing_date: billingCycle.next.toISOString().split('T')[0],
    };
    
    res.json({ usage: formattedUsage });
  } catch (error) {
    console.error("Get usage error:", error);
    res.status(500).json({ error: "Failed to get usage" });
  }
});

// Get activity logs for a business
router.get("/accounts/:id/activity", authenticateAdmin, async (req, res) => {
  try {
    const logs = await AdminActivityLog.findByBusiness(req.params.id, 50);
    res.json({ logs: logs || [] });
  } catch (error) {
    console.error("Get activity error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    // Return empty array instead of error to prevent UI breaking
    res.json({ logs: [] });
  }
});

// Get all activity logs (admin)
router.get("/activity", authenticateAdmin, async (req, res) => {
  try {
    const { supabaseClient } = await import("../config/database.js");
    const { limit = 100 } = req.query;
    const { data, error } = await supabaseClient
      .from("admin_activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));
    
    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (error) {
    console.error("Get all activity error:", error);
    res.status(500).json({ error: "Failed to get activity" });
  }
});

// Sync VAPI assistant (update prompt)
router.post("/accounts/:id/sync-vapi", authenticateAdmin, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    if (!business.vapi_assistant_id) {
      return res.status(400).json({ error: "No VAPI assistant found" });
    }
    
    const { updateAssistant } = await import("../services/vapi.js");
    const { generateAssistantPrompt } = await import("../templates/vapi-assistant-template.js");
    const agent = await AIAgent.findByBusinessId(business.id);
    
    const updatedPrompt = await generateAssistantPrompt({
      name: business.name,
      public_phone_number: business.public_phone_number || "",
      timezone: business.timezone,
      business_hours: agent?.business_hours || {},
      faqs: agent?.faqs || [],
      contact_email: business.email,
      address: business.address || "",
      allow_call_transfer: business.allow_call_transfer ?? true,
      after_hours_behavior: business.after_hours_behavior || "take_message",
    });
    
    await updateAssistant(business.vapi_assistant_id, {
      systemPrompt: updatedPrompt,
    });
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: req.params.id,
      action: "sync_vapi",
      details: { assistant_id: business.vapi_assistant_id },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Sync VAPI error:", error);
    res.status(500).json({ error: "Failed to sync VAPI" });
  }
});

    // Get dashboard stats
    router.get("/stats", authenticateAdmin, async (req, res) => {
      try {
        const { supabaseClient } = await import("../config/database.js");
        const { PricingPackage } = await import("../models/PricingPackage.js");
        
        // Get businesses with their package relationships
        const { data: businesses, error: bizError } = await supabaseClient
          .from("businesses")
          .select("id, ai_enabled, plan_tier, package_id")
          .is("deleted_at", null);
        
        if (bizError) throw bizError;
        
        // Get all packages to map package_id to package name
        let packagesMap = new Map();
        try {
          const allPackages = await PricingPackage.findAll({ includeInactive: true, includePrivate: true });
          allPackages.forEach(pkg => {
            packagesMap.set(pkg.id, pkg.name);
          });
          console.log("[Admin Stats] Loaded packages:", Array.from(packagesMap.entries()).map(([id, name]) => ({ id, name })));
        } catch (pkgError) {
          console.warn("[Admin Stats] Could not fetch packages for plan distribution:", pkgError.message);
        }
    
    // Get demo usage stats
    let demoStats = {
      total_demos: 0,
      total_minutes: 0,
      total_demos_today: 0,
      total_minutes_today: 0,
      total_demos_this_month: 0,
      total_minutes_this_month: 0,
      total_unique_users: 0,
      users_with_marketing_consent: 0,
    };
    
    try {
      // Total demo usage (all time)
      const { data: allDemos, error: allDemosError } = await supabaseClient
        .from("demo_usage")
        .select("minutes_used, email, marketing_consent");
      
      if (!allDemosError && allDemos) {
        demoStats.total_demos = allDemos.length;
        demoStats.total_minutes = allDemos.reduce((sum, demo) => sum + (parseFloat(demo.minutes_used) || 0), 0);
        
        // Count unique users
        const uniqueEmails = new Set(allDemos.filter(d => d.email).map(d => d.email));
        demoStats.total_unique_users = uniqueEmails.size;
        
        // Count users with marketing consent
        const usersWithConsent = new Set(
          allDemos
            .filter(d => d.email && d.marketing_consent === true)
            .map(d => d.email)
        );
        demoStats.users_with_marketing_consent = usersWithConsent.size;
      }
      
      // Demo usage today
      const today = new Date().toISOString().split('T')[0];
      const { data: todayDemos, error: todayError } = await supabaseClient
        .from("demo_usage")
        .select("minutes_used")
        .eq("date", today);
      
      if (!todayError && todayDemos) {
        demoStats.total_demos_today = todayDemos.length;
        demoStats.total_minutes_today = todayDemos.reduce((sum, demo) => sum + (parseFloat(demo.minutes_used) || 0), 0);
      }
      
      // Demo usage this month
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const { data: monthDemos, error: monthError } = await supabaseClient
        .from("demo_usage")
        .select("minutes_used")
        .eq("month", currentMonth)
        .eq("year", currentYear);
      
      if (!monthError && monthDemos) {
        demoStats.total_demos_this_month = monthDemos.length;
        demoStats.total_minutes_this_month = monthDemos.reduce((sum, demo) => sum + (parseFloat(demo.minutes_used) || 0), 0);
      }
    } catch (demoError) {
      // If demo_usage table doesn't exist yet, just log warning and continue
      console.warn("[Admin Stats] Could not fetch demo stats (table may not exist yet):", demoError.message);
    }
    
    // Helper function to determine plan tier from business (checks package name first, then plan_tier field)
    const getPlanTier = (business) => {
      // First, try to get tier from package name if package_id exists
      if (business.package_id && packagesMap.has(business.package_id)) {
        const packageName = packagesMap.get(business.package_id).toLowerCase();
        if (packageName.includes('starter')) return 'starter';
        if (packageName.includes('core')) return 'core';
        if (packageName.includes('pro')) return 'pro';
      }
      
      // Fall back to plan_tier field
      if (business.plan_tier) {
        const normalized = business.plan_tier.toLowerCase().trim();
        if (normalized.includes('starter')) return 'starter';
        if (normalized.includes('core')) return 'core';
        if (normalized.includes('pro')) return 'pro';
      }
      
      return null; // Unknown tier
    };
    
    // Calculate tier counts
    const tierCounts = {
      starter: 0,
      core: 0,
      pro: 0,
    };
    
    // Debug: Log sample businesses to understand data structure
    if (businesses.length > 0) {
      console.log("[Admin Stats] Sample business data:", JSON.stringify(businesses.slice(0, 3).map(b => ({
        id: b.id,
        plan_tier: b.plan_tier,
        package_id: b.package_id
      })), null, 2));
    }
    
    businesses.forEach(business => {
      const tier = getPlanTier(business);
      console.log(`[Admin Stats] Business ${business.id.substring(0, 8)}... plan_tier="${business.plan_tier}", package_id="${business.package_id}", detected_tier="${tier}"`);
      if (tier === 'starter') tierCounts.starter++;
      else if (tier === 'core') tierCounts.core++;
      else if (tier === 'pro') tierCounts.pro++;
    });
    
    console.log("[Admin Stats] Plan distribution calculated:", tierCounts);
    
    const stats = {
      total_accounts: businesses.length,
      active_accounts: businesses.filter(b => b.ai_enabled).length,
      inactive_accounts: businesses.filter(b => !b.ai_enabled).length,
      by_tier: tierCounts,
      demo_usage: demoStats,
    };
    
    res.json({ stats });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Get demo users (for outreach)
// GET /api/admin/demo-users?marketing_consent=true
router.get("/demo-users", authenticateAdmin, async (req, res) => {
  try {
    const { marketing_consent } = req.query;
    const { supabaseClient } = await import("../config/database.js");
    
    console.log("[Admin Demo Users] Fetching demo users, marketing_consent filter:", marketing_consent);
    
    let query = supabaseClient
      .from("demo_usage")
      .select("*")
      .order("created_at", { ascending: false });
    
    // Filter by marketing consent if specified
    if (marketing_consent === "true") {
      query = query.eq("marketing_consent", true);
    }
    
    const { data: demos, error } = await query;
    
    if (error) {
      console.error("[Admin Demo Users] Error fetching demo users:", error);
      console.error("[Admin Demo Users] Error details:", JSON.stringify(error, null, 2));
      return res.status(500).json({ 
        error: "Failed to fetch demo users",
        details: error.message,
        hint: error.message?.includes("does not exist") 
          ? "The demo_usage table may not exist. Please run the migration: migrations/add_demo_usage_table.sql"
          : undefined
      });
    }
    
    console.log("[Admin Demo Users] Raw demo records from DB:", demos?.length || 0);
    
    // Group by email to show unique users (keep most recent demo per email)
    const uniqueDemos = [];
    const seenEmails = new Set();
    
    if (demos && demos.length > 0) {
      for (const demo of demos) {
        if (demo.email && !seenEmails.has(demo.email)) {
          seenEmails.add(demo.email);
          uniqueDemos.push({
            email: demo.email,
            business_name: demo.business_name,
            marketing_consent: demo.marketing_consent || false,
            last_demo_date: demo.date,
            total_demos: demos.filter(d => d.email === demo.email).length,
            total_minutes: demos
              .filter(d => d.email === demo.email)
              .reduce((sum, d) => sum + (parseFloat(d.minutes_used) || 0), 0),
            created_at: demo.created_at,
          });
        }
      }
      console.log("[Admin Demo Users] Grouped to unique users:", uniqueDemos.length);
    } else {
      console.log("[Admin Demo Users] No demo records found in database");
      console.log("[Admin Demo Users] Note: Demo tracking was added recently. Demos from before the tracking was implemented won't appear in this list.");
    }
    
    res.json({
      demos: uniqueDemos,
      total: uniqueDemos.length,
      with_marketing_consent: uniqueDemos.filter(d => d.marketing_consent).length,
      raw_count: demos?.length || 0,
    });
  } catch (error) {
    console.error("[Admin Demo Users] Exception:", error);
    console.error("[Admin Demo Users] Error stack:", error.stack);
    res.status(500).json({ 
      error: "Failed to get demo users",
      details: error.message 
    });
  }
});

// Test VAPI connection
router.get("/test-vapi", authenticateAdmin, async (req, res) => {
  try {
    const { createAssistant, provisionPhoneNumber } = await import("../services/vapi.js");
    
    // Test 1: Create a test assistant
    const testAssistant = await createAssistant({
      name: "Tavari Test Assistant",
      public_phone_number: "",
      timezone: "America/New_York",
      business_hours: {},
      faqs: [],
      contact_email: "test@tavari.com",
      address: "",
      allow_call_transfer: false,
      after_hours_behavior: "take_message",
    });
    
    // Test 2: Try to provision a phone number
    let phoneNumber = null;
    try {
      phoneNumber = await provisionPhoneNumber();
    } catch (error) {
      console.log("Phone number provisioning test failed (may not have available numbers):", error.message);
    }
    
    // Cleanup: Delete test assistant
    try {
      const axios = (await import("axios")).default;
      await axios.delete(`https://api.vapi.ai/assistant/${testAssistant.id}`, {
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        },
      });
    } catch (error) {
      console.log("Failed to cleanup test assistant:", error.message);
    }
    
    res.json({
      success: true,
      tests: {
        assistant_creation: !!testAssistant.id,
        phone_provisioning: !!phoneNumber,
      },
      details: {
        test_assistant_id: testAssistant.id,
        test_phone_number: phoneNumber?.phoneNumber || null,
      },
    });
  } catch (error) {
    console.error("VAPI test error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      tests: {
        assistant_creation: false,
        phone_provisioning: false,
      },
    });
  }
});

import { AIAgent } from "../models/AIAgent.js";

// ============================================
// PACKAGE MANAGEMENT ROUTES
// ============================================

// Get all packages
router.get("/packages", authenticateAdmin, async (req, res) => {
  try {
    const { includeInactive, module_key } = req.query;
    const packages = await PricingPackage.findAll({
      includeInactive: includeInactive === 'true',
      includePrivate: true, // Admins can see all packages
      moduleKey: module_key || null, // Filter by module if provided
    });

    // Get business count for each package
    const packagesWithCounts = await Promise.all(
      packages.map(async (pkg) => {
        const businessCount = await PricingPackage.getBusinessCount(pkg.id);
        return {
          ...pkg,
          business_count: businessCount,
        };
      })
    );

    res.json({ packages: packagesWithCounts });
  } catch (error) {
    console.error("Get packages error:", error);
    res.status(500).json({ error: "Failed to get packages" });
  }
});

// Get single package with businesses
router.get("/packages/:id", authenticateAdmin, async (req, res) => {
  try {
    const packageId = req.params.id;
    const pkg = await PricingPackage.findById(packageId);
    
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const businesses = await PricingPackage.getBusinesses(packageId);
    const businessCount = businesses.length;

    res.json({
      package: {
        ...pkg,
        business_count: businessCount,
        businesses,
      },
    });
  } catch (error) {
    console.error("Get package error:", error);
    res.status(500).json({ error: "Failed to get package" });
  }
});

// Create new package
router.post("/packages", authenticateAdmin, async (req, res) => {
  try {
    const packageData = req.body;
    
    console.log("Creating package with data:", packageData);
    
    // Validate ClickBank package - only one per module allowed
    if (packageData.is_clickbank_package) {
      const moduleKey = packageData.module_key || 'phone-agent';
      const hasOther = await PricingPackage.hasOtherClickBankPackage(moduleKey, null);
      if (hasOther) {
        return res.status(400).json({
          error: `Only one ClickBank package is allowed per module. Another ClickBank package already exists for module: ${moduleKey}`
        });
      }
      
      // Validate commission rate if ClickBank package
      if (packageData.clickbank_commission_rate !== null && packageData.clickbank_commission_rate !== undefined) {
        const rate = parseFloat(packageData.clickbank_commission_rate);
        if (isNaN(rate) || rate < 0 || rate > 100) {
          return res.status(400).json({
            error: 'ClickBank commission rate must be between 0 and 100'
          });
        }
      }
    }
    
    const pkg = await PricingPackage.create(packageData);

    // Log activity (non-blocking)
    AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: "create_package",
      details: { package_id: pkg.id, package_name: pkg.name },
    }).catch((logError) => {
      console.error("[Admin] Failed to log activity (non-blocking):", logError);
    });

    res.status(201).json({ package: pkg });
  } catch (error) {
    console.error("Create package error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      packageData: req.body,
    });
    res.status(500).json({ 
      error: "Failed to create package",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update package
router.put("/packages/:id", authenticateAdmin, async (req, res) => {
  try {
    const packageId = req.params.id;
    const packageData = req.body;

    const existingPackage = await PricingPackage.findById(packageId);
    if (!existingPackage) {
      return res.status(404).json({ error: "Package not found" });
    }

    // Validate minimum price amounts for Stripe
    // Stripe minimum charge amounts by currency (CAD minimum is $0.50)
    const MINIMUM_AMOUNTS = {
      cad: 0.50,
      usd: 0.50,
      eur: 0.50,
      gbp: 0.30,
    };
    const currency = 'cad'; // Currently only supporting CAD
    const minimumAmount = MINIMUM_AMOUNTS[currency.toLowerCase()] || 0.50;

    if (packageData.monthly_price !== undefined && packageData.monthly_price < minimumAmount) {
      return res.status(400).json({
        error: `Monthly price ($${packageData.monthly_price.toFixed(2)} ${currency.toUpperCase()}) is below Stripe's minimum charge amount of $${minimumAmount.toFixed(2)} ${currency.toUpperCase()}. Stripe will reject payments below this amount.`,
      });
    }

    if (packageData.sale_price !== undefined && packageData.sale_price !== null && packageData.sale_price < minimumAmount) {
      return res.status(400).json({
        error: `Sale price ($${packageData.sale_price.toFixed(2)} ${currency.toUpperCase()}) is below Stripe's minimum charge amount of $${minimumAmount.toFixed(2)} ${currency.toUpperCase()}. Stripe will reject payments below this amount.`,
      });
    }

    // Validate ClickBank package - only one per module allowed
    if (packageData.is_clickbank_package) {
      const moduleKey = packageData.module_key || existingPackage.module_key || 'phone-agent';
      const hasOther = await PricingPackage.hasOtherClickBankPackage(moduleKey, packageId);
      if (hasOther) {
        return res.status(400).json({
          error: `Only one ClickBank package is allowed per module. Another ClickBank package already exists for module: ${moduleKey}`
        });
      }
      
      // Validate commission rate if ClickBank package
      if (packageData.clickbank_commission_rate !== null && packageData.clickbank_commission_rate !== undefined) {
        const rate = parseFloat(packageData.clickbank_commission_rate);
        if (isNaN(rate) || rate < 0 || rate > 100) {
          return res.status(400).json({
            error: 'ClickBank commission rate must be between 0 and 100'
          });
        }
      }
    }

    const pkg = await PricingPackage.update(packageId, packageData);

    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: "update_package",
      details: { package_id: packageId, changes: packageData },
    });

    res.json({ package: pkg });
  } catch (error) {
    console.error("Update package error:", error);
    res.status(500).json({ error: "Failed to update package" });
  }
});

// Delete package (soft delete)
router.delete("/packages/:id", authenticateAdmin, async (req, res) => {
  try {
    const packageId = req.params.id;

    const existingPackage = await PricingPackage.findById(packageId);
    if (!existingPackage) {
      return res.status(404).json({ error: "Package not found" });
    }

    // Check if package has businesses assigned
    const businessCount = await PricingPackage.getBusinessCount(packageId);
    if (businessCount > 0) {
      return res.status(400).json({
        error: `Cannot delete package. ${businessCount} business(es) are currently assigned to this package. Please reassign them first.`,
        business_count: businessCount,
      });
    }

    await PricingPackage.delete(packageId);

    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: "delete_package",
      details: { package_id: packageId, package_name: existingPackage.name },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete package error:", error);
    res.status(500).json({ error: "Failed to delete package" });
  }
});

// Assign package to business
router.post("/packages/:packageId/assign/:businessId", authenticateAdmin, async (req, res) => {
  try {
    const { packageId, businessId } = req.params;

    const pkg = await PricingPackage.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Update business with new package
    await Business.update(businessId, {
      package_id: packageId,
      plan_tier: pkg.name.toLowerCase(), // Keep plan_tier for backwards compatibility
      usage_limit_minutes: pkg.minutes_included,
    });

    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: businessId,
      action: "assign_package",
      details: { package_id: packageId, package_name: pkg.name },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Assign package error:", error);
    res.status(500).json({ error: "Failed to assign package" });
  }
});

// Get all support tickets (admin)
router.get("/support/tickets", authenticateAdmin, async (req, res) => {
  try {
    const { status, urgency, search } = req.query;
    const { supabaseClient } = await import("../config/database.js");
    
    let query = supabaseClient
      .from("support_tickets")
      .select(`
        *,
        businesses (
          id,
          name,
          email,
          phone
        ),
        users (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .order("created_at", { ascending: false });
    
    if (status) {
      query = query.eq("status", status);
    }
    
    if (urgency) {
      query = query.eq("urgency", urgency);
    }
    
    if (search) {
      query = query.or(`description.ilike.%${search}%,issue_type.ilike.%${search}%`);
    }
    
    const { data, error } = await query.limit(100);
    
    if (error) throw error;
    
    res.json({ tickets: data || [] });
  } catch (error) {
    console.error("Get support tickets error:", error);
    res.status(500).json({ error: "Failed to get support tickets" });
  }
});

// Get single support ticket (admin)
router.get("/support/tickets/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { supabaseClient } = await import("../config/database.js");
    
    // First get the ticket
    const { data: ticket, error: ticketError } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .single();
    
    if (ticketError) throw ticketError;
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    
    // Fetch related data separately if business_id exists
    let business = null;
    let user = null;
    let resolvedByAdmin = null;
    
    if (ticket.business_id) {
      const { data: businessData, error: businessError } = await supabaseClient
        .from("businesses")
        .select("id, name, email, phone, vapi_phone_number")
        .eq("id", ticket.business_id)
        .single();
      
      if (businessError) {
        console.error("Error fetching business for ticket:", {
          ticketId: id,
          businessId: ticket.business_id,
          error: businessError,
        });
      } else if (businessData) {
        business = businessData;
        console.log("Successfully fetched business:", business.name);
      } else {
        console.warn(`Business not found for business_id: ${ticket.business_id}`);
      }
    } else {
      console.warn(`Ticket ${id} has no business_id`);
    }
    
    if (ticket.user_id) {
      const { data: userData, error: userError } = await supabaseClient
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("id", ticket.user_id)
        .single();
      
      if (!userError && userData) {
        user = userData;
      }
    }
    
    if (ticket.resolved_by) {
      const { data: adminData, error: adminError } = await supabaseClient
        .from("admin_users")
        .select("id, email, first_name, last_name")
        .eq("id", ticket.resolved_by)
        .single();
      
      if (!adminError && adminData) {
        resolvedByAdmin = adminData;
      }
    }
    
    // Combine the data
    const ticketWithRelations = {
      ...ticket,
      businesses: business,
      users: user,
      resolved_by_admin: resolvedByAdmin,
    };
    
    // Debug logging
    console.log("Ticket response:", {
      ticketId: id,
      hasBusinessId: !!ticket.business_id,
      businessId: ticket.business_id,
      hasBusiness: !!business,
      businessName: business?.name,
    });
    
    res.json({ ticket: ticketWithRelations });
  } catch (error) {
    console.error("Get support ticket error:", error);
    res.status(500).json({ error: "Failed to get support ticket" });
  }
});

// Update support ticket status (admin)
router.patch("/support/tickets/:id/status", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }
    
    const { supabaseClient } = await import("../config/database.js");
    
    const updateData = {
      status,
      updated_at: new Date().toISOString(),
    };
    
    if (status === "resolved" || status === "closed") {
      updateData.resolved_by = req.adminId;
      updateData.resolved_at = new Date().toISOString();
      if (resolution_notes) {
        updateData.resolution_notes = resolution_notes;
      }
    }
    
    const { data, error } = await supabaseClient
      .from("support_tickets")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: data.business_id,
      action: "update_ticket_status",
      details: { ticket_id: id, status, resolution_notes },
    });
    
    // Send email notification to business (non-blocking)
    if (data.business_id) {
      const business = await Business.findById(data.business_id);
      if (business) {
        sendSupportTicketUpdateNotification(
          data,
          business,
          "status",
          req.admin.first_name || req.admin.email
        ).catch((err) => {
          console.error("[Admin] Failed to send ticket status update notification (non-blocking):", err);
        });
      }
    }
    
    res.json({ ticket: data });
  } catch (error) {
    console.error("Update ticket status error:", error);
    res.status(500).json({ error: "Failed to update ticket status" });
  }
});

// Add response/note to support ticket (admin)
router.post("/support/tickets/:id/response", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { response_text } = req.body;
    
    if (!response_text) {
      return res.status(400).json({ error: "Response text is required" });
    }
    
    const { supabaseClient } = await import("../config/database.js");
    
    // Get ticket
    const { data: ticket, error: ticketError } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .single();
    
    if (ticketError) throw ticketError;
    
    // Fetch business separately
    let business = null;
    if (ticket.business_id) {
      try {
        business = await Business.findById(ticket.business_id);
        if (!business) {
          console.warn(`[Admin] Business not found for business_id: ${ticket.business_id}`);
        }
      } catch (businessError) {
        console.error("[Admin] Error fetching business for ticket response:", businessError);
        // Continue without business - email notification will be skipped
      }
    }
    
    // Update ticket with response in resolution_notes
    const currentNotes = ticket.resolution_notes || "";
    const timestamp = new Date().toLocaleString();
    const adminName = (req.admin && (req.admin.first_name || req.admin.email)) || "Support Team";
    const newNotes = currentNotes 
      ? `${currentNotes}\n\n--- Response from ${adminName} (${timestamp}) ---\n${response_text}`
      : `--- Response from ${adminName} (${timestamp}) ---\n${response_text}`;
    
    const newStatus = ticket.status === "open" ? "in-progress" : ticket.status;
    
    const { data, error } = await supabaseClient
      .from("support_tickets")
      .update({
        resolution_notes: newNotes,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Log activity (non-blocking - don't fail if logging fails)
    AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: ticket.business_id,
      action: "respond_to_ticket",
      details: { ticket_id: id, response_text },
    }).catch((logError) => {
      console.error("[Admin] Failed to log activity (non-blocking):", logError);
    });
    
    // Send email notification to business (non-blocking)
    if (business) {
      // Use the updated ticket data, but ensure all fields are present
      const ticketForNotification = {
        ...ticket,
        ...data,
        status: newStatus,
        resolution_notes: newNotes,
      };
      
      sendSupportTicketUpdateNotification(
        ticketForNotification,
        business,
        "response",
        (req.admin && (req.admin.first_name || req.admin.email)) || "Support Team",
        response_text
      ).catch((err) => {
        console.error("[Admin] Failed to send ticket response notification (non-blocking):", err);
      });
    }
    
    res.json({ ticket: data });
  } catch (error) {
    console.error("Add ticket response error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      ticketId: id,
    });
    res.status(500).json({ 
      error: "Failed to add ticket response",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// SMS PHONE NUMBER MANAGEMENT
// ============================================

// Get all unassigned SMS phone numbers
router.get("/phone-numbers/unassigned", authenticateAdmin, async (req, res) => {
  try {
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    if (!TELNYX_API_KEY) {
      return res.status(500).json({ error: "TELNYX_API_KEY not configured" });
    }

    const axios = (await import("axios")).default;
    const { supabaseClient } = await import("../config/database.js");
    
    // Get all phone numbers from Telnyx
    const telnyxResponse = await axios.get("https://api.telnyx.com/v2/phone_numbers", {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'page[size]': 100, // Get up to 100 numbers per page
      },
    });
    
    const allTelnyxNumbers = telnyxResponse.data?.data || [];
    console.log(`[Admin] Found ${allTelnyxNumbers.length} phone numbers in Telnyx account`);
    
    // Get all phone numbers assigned to businesses for SMS
    // Check both business_phone_numbers table (new) and telnyx_number field (legacy)
    
    // Get all active phone numbers from business_phone_numbers table
    const { data: businessPhoneNumbers, error: bpnError } = await supabaseClient
      .from('business_phone_numbers')
      .select('business_id, phone_number, businesses!inner(name)')
      .eq('is_active', true);
    
    if (bpnError) {
      console.warn('[Admin] Error fetching business_phone_numbers (table may not exist yet):', bpnError.message);
    }
    
    // Also get businesses with telnyx_number (legacy support)
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('id, name, telnyx_number, vapi_phone_number')
      .is('deleted_at', null);
    
    if (error) {
      console.error('[Admin] Error fetching businesses:', error);
      return res.status(500).json({ error: "Failed to fetch assigned numbers" });
    }
    
    console.log(`[Admin] Found ${businesses?.length || 0} businesses in database`);
    console.log(`[Admin] Found ${businessPhoneNumbers?.length || 0} phone numbers in business_phone_numbers table`);
    
    // Create set of assigned SMS numbers
    const assignedSMSNumbers = new Set();
    const assignedSMSNumbersOriginal = [];
    
    // Add numbers from business_phone_numbers table (new system)
    (businessPhoneNumbers || []).forEach(bpn => {
      const phoneNumber = bpn.phone_number;
      if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim() !== '') {
        const original = phoneNumber;
        let normalized = original.replace(/[^0-9+]/g, '').trim();
        if (!normalized.startsWith('+')) normalized = '+' + normalized;
        assignedSMSNumbers.add(normalized);
        assignedSMSNumbersOriginal.push({ 
          original, 
          normalized, 
          business: bpn.businesses?.name || 'Unknown',
          business_id: bpn.business_id,
          source: 'business_phone_numbers' 
        });
      }
    });
    
    // Also check legacy telnyx_number field (only if business doesn't have numbers in new table)
    (businesses || []).forEach(b => {
      // Check if this business already has numbers in business_phone_numbers (skip to avoid duplicates)
      const hasInNewTable = businessPhoneNumbers?.some(bpn => bpn.business_id === b.id);
      if (hasInNewTable) {
        return; // Skip legacy fields if business has numbers in new table
      }
      
      // Check telnyx_number (legacy support)
      const phoneNumber = b.telnyx_number;
      if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim() !== '') {
        const original = phoneNumber;
        let normalized = original.replace(/[^0-9+]/g, '').trim();
        if (!normalized.startsWith('+')) normalized = '+' + normalized;
        assignedSMSNumbers.add(normalized);
        assignedSMSNumbersOriginal.push({ 
          original, 
          normalized, 
          business: b.name, 
          business_id: b.id,
          source: 'telnyx_number (legacy)' 
        });
      }
    });
    
    console.log(`[Admin] Found ${assignedSMSNumbersOriginal.length} businesses with telnyx_number assigned`);
    console.log(`[Admin] Total unique normalized numbers in set: ${assignedSMSNumbers.size}`);
    console.log(`[Admin] All assigned numbers from DB:`, assignedSMSNumbersOriginal);
    console.log(`[Admin] Normalized set (first 10):`, Array.from(assignedSMSNumbers).slice(0, 10));
    
    // Filter out numbers assigned for SMS (telnyx_number)
    // Note: A number can be used for both calls (vapi_phone_number) and SMS (telnyx_number)
    // We only filter out numbers that are specifically assigned for SMS
    const unassignedNumbers = [];
    const assignedNumbers = [];
    
    allTelnyxNumbers.forEach(telnyxNum => {
      const phoneNumber = telnyxNum.phone_number;
      // Normalize Telnyx number
      let normalizedWithPlus = phoneNumber.replace(/[^0-9+]/g, '').trim();
      if (!normalizedWithPlus.startsWith('+')) {
        normalizedWithPlus = '+' + normalizedWithPlus;
      }
      const normalizedWithoutPlus = normalizedWithPlus.replace(/^\+/, '');
      
      // Check if this number is assigned for SMS (check both formats)
      let isAssigned = assignedSMSNumbers.has(normalizedWithPlus) || assignedSMSNumbers.has(normalizedWithoutPlus);
      
      // Also check if any assigned number is a prefix/suffix match (handle incomplete numbers)
      // This handles cases where DB has +1669240773 but Telnyx has +16692407730
      if (!isAssigned && normalizedWithPlus.startsWith('+1')) {
        const last10Digits = normalizedWithPlus.slice(-10); // Last 10 digits of Telnyx number
        
        // Check if any assigned number ends with these 10 digits or vice versa
        for (const assigned of assignedSMSNumbers) {
          const assignedClean = assigned.replace(/^\+1?/, ''); // Remove +1 or + from assigned
          const telnyxClean = normalizedWithPlus.replace(/^\+1/, ''); // Remove +1 from Telnyx
          
          // Check if one is a prefix of the other (handles incomplete numbers)
          if (assignedClean.length >= 9 && telnyxClean.length >= 9) {
            // Compare last 9 digits (more lenient than 10)
            const assignedLast9 = assignedClean.slice(-9);
            const telnyxLast9 = telnyxClean.slice(-9);
            
            if (assignedLast9 === telnyxLast9) {
              isAssigned = true;
              console.log(`[Admin] ✅ Matched via partial: DB has ${assigned}, Telnyx has ${normalizedWithPlus} (last 9 digits match)`);
              break;
            }
            
            // Also check if one contains the other (handles +1669240773 vs +16692407730)
            if (assignedClean.includes(telnyxClean) || telnyxClean.includes(assignedClean)) {
              isAssigned = true;
              console.log(`[Admin] ✅ Matched via contains: DB has ${assigned}, Telnyx has ${normalizedWithPlus}`);
              break;
            }
          }
        }
      }
      
      if (isAssigned) {
        assignedNumbers.push({
          ...telnyxNum,
          normalized: normalizedWithPlus,
          phone_number: phoneNumber,
        });
        console.log(`[Admin] ✅ Found assigned number: ${phoneNumber} (normalized: ${normalizedWithPlus})`);
      } else {
        unassignedNumbers.push({
          ...telnyxNum,
          normalized: normalizedWithPlus,
          phone_number: phoneNumber,
        });
        // Log potential matches for debugging
        if (normalizedWithPlus.startsWith('+1')) {
          const last10Digits = normalizedWithPlus.slice(-10);
          const potentialMatches = Array.from(assignedSMSNumbers).filter(a => 
            a.includes(last10Digits) || last10Digits.includes(a.replace(/^\+1?/, ''))
          );
          if (potentialMatches.length > 0) {
            console.log(`[Admin] ⚠️  Potential match for ${phoneNumber}:`, potentialMatches);
          }
        }
      }
    });
    
    console.log(`[Admin] Filtered results: ${assignedNumbers.length} assigned, ${unassignedNumbers.length} unassigned`);
    if (assignedNumbers.length > 0) {
      console.log(`[Admin] All assigned numbers from Telnyx:`, assignedNumbers.map(n => `${n.phone_number} (${n.normalized})`));
    }
    if (unassignedNumbers.length > 0 && assignedSMSNumbersOriginal.length > 0) {
      console.log(`[Admin] ⚠️  WARNING: Found ${assignedSMSNumbersOriginal.length} assigned numbers in DB but ${assignedNumbers.length} matched in Telnyx`);
      console.log(`[Admin] Checking first unassigned number:`, unassignedNumbers[0]?.phone_number, `(normalized: ${unassignedNumbers[0]?.normalized})`);
      console.log(`[Admin] Does it match any assigned?`, {
        'with+': assignedSMSNumbers.has(unassignedNumbers[0]?.normalized),
        'without+': assignedSMSNumbers.has(unassignedNumbers[0]?.normalized?.replace(/^\+/, '')),
        'assignedSet': Array.from(assignedSMSNumbers).slice(0, 5),
      });
    }
    
    console.log(`[Admin] Found ${unassignedNumbers.length} unassigned phone numbers`);
    
    res.json({
      total: allTelnyxNumbers.length,
      assigned: assignedNumbers.length,
      unassigned: unassignedNumbers.length,
      numbers: unassignedNumbers.map(num => ({
        phone_number: num.phone_number,
        id: num.id,
        status: num.status,
        messaging_profile_id: num.messaging_profile_id,
        connection_id: num.connection_id,
        region_information: num.region_information,
      })),
      // Include assigned numbers for debugging
      _debug: {
        assigned_count: assignedNumbers.length,
        assigned_numbers: assignedNumbers.slice(0, 5).map(n => n.phone_number),
        assigned_sms_numbers_from_db: Array.from(assignedSMSNumbers).slice(0, 5),
      },
    });
  } catch (error) {
    console.error("Get unassigned phone numbers error:", error);
    res.status(500).json({ error: error.message || "Failed to get unassigned phone numbers" });
  }
});

// Migrate vapi_phone_number to telnyx_number for a business
router.post("/phone-numbers/migrate-to-telnyx/:businessId", authenticateAdmin, async (req, res) => {
  try {
    const { businessId } = req.params;
    
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Check if business has vapi_phone_number but no telnyx_number
    if (!business.vapi_phone_number) {
      return res.status(400).json({ error: "Business does not have a vapi_phone_number to migrate" });
    }

    if (business.telnyx_number) {
      return res.status(400).json({ error: "Business already has a telnyx_number. Use assign-sms to change it." });
    }

    // Copy vapi_phone_number to telnyx_number
    await Business.update(businessId, {
      telnyx_number: business.vapi_phone_number,
    });

    // Log admin activity (gracefully handle if table doesn't exist)
    try {
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        business_id: businessId,
        action: "migrate_phone_to_telnyx",
        details: { 
          phone_number: business.vapi_phone_number,
          business_name: business.name,
        },
      });
    } catch (logError) {
      console.warn('[Admin] Failed to log activity (table may not exist):', logError.message);
      // Continue without logging - don't fail the request
    }

    res.json({
      success: true,
      phone_number: business.vapi_phone_number,
      business: {
        id: business.id,
        name: business.name,
      },
      message: "Phone number migrated from vapi_phone_number to telnyx_number",
    });
  } catch (error) {
    console.error("Migrate phone number error:", error);
    res.status(500).json({ error: error.message || "Failed to migrate phone number" });
  }
});

// Get all phone numbers for a business
router.get("/phone-numbers/business/:businessId", authenticateAdmin, async (req, res) => {
  try {
    const { businessId } = req.params;
    const { BusinessPhoneNumber } = await import("../models/BusinessPhoneNumber.js");
    
    const numbers = await BusinessPhoneNumber.findByBusinessId(businessId);
    
    // Also get business info for verification
    const business = await Business.findById(businessId);
    
    res.json({
      success: true,
      numbers: numbers || [],
      business: business ? {
        id: business.id,
        name: business.name,
        telnyx_number: business.telnyx_number, // Legacy field for comparison
      } : null,
      verification: {
        total_numbers: numbers?.length || 0,
        active_numbers: numbers?.filter(n => n.is_active).length || 0,
        primary_numbers: numbers?.filter(n => n.is_primary).length || 0,
      },
    });
  } catch (error) {
    console.error("Get business phone numbers error:", error);
    res.status(500).json({ error: error.message || "Failed to get business phone numbers" });
  }
});

// Verify all phone number assignments (admin diagnostic endpoint)
router.get("/phone-numbers/verify", authenticateAdmin, async (req, res) => {
  try {
    const { supabaseClient } = await import("../config/database.js");
    const { BusinessPhoneNumber } = await import("../models/BusinessPhoneNumber.js");
    
    // Get all businesses with their phone numbers
    const { data: businesses, error: businessError } = await supabaseClient
      .from('businesses')
      .select('id, name, telnyx_number')
      .is('deleted_at', null);
    
    if (businessError) {
      throw businessError;
    }
    
    const verification = [];
    
    for (const business of businesses || []) {
      try {
        const numbers = await BusinessPhoneNumber.findByBusinessId(business.id);
        
        verification.push({
          business_id: business.id,
          business_name: business.name,
          legacy_telnyx_number: business.telnyx_number,
          numbers_in_table: numbers?.length || 0,
          active_numbers: numbers?.filter(n => n.is_active).length || 0,
          primary_numbers: numbers?.filter(n => n.is_primary).length || 0,
          phone_numbers: numbers?.map(n => ({
            id: n.id,
            phone_number: n.phone_number,
            is_primary: n.is_primary,
            is_active: n.is_active,
            created_at: n.created_at,
          })) || [],
        });
      } catch (error) {
        verification.push({
          business_id: business.id,
          business_name: business.name,
          error: error.message,
        });
      }
    }
    
    // Also get total counts
    const { data: allNumbers, error: numbersError } = await supabaseClient
      .from('business_phone_numbers')
      .select('id, business_id, phone_number, is_primary, is_active');
    
    res.json({
      success: true,
      summary: {
        total_businesses: businesses?.length || 0,
        total_phone_numbers: allNumbers?.length || 0,
        active_phone_numbers: allNumbers?.filter(n => n.is_active).length || 0,
        primary_phone_numbers: allNumbers?.filter(n => n.is_primary).length || 0,
      },
      businesses: verification,
      all_assignments: allNumbers || [],
    });
  } catch (error) {
    console.error("Verify phone numbers error:", error);
    res.status(500).json({ error: error.message || "Failed to verify phone numbers" });
  }
});

// Assign SMS number to business (adds to business_phone_numbers table)
router.post("/phone-numbers/assign-sms/:businessId", authenticateAdmin, async (req, res) => {
  try {
    const { businessId } = req.params;
    const { phone_number, is_primary } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Normalize phone number
    let phoneNumberE164 = phone_number.replace(/[^0-9+]/g, '').trim();
    if (!phoneNumberE164.startsWith('+')) {
      phoneNumberE164 = '+' + phoneNumberE164;
    }

    // Verify number exists in Telnyx
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    if (!TELNYX_API_KEY) {
      return res.status(500).json({ error: "TELNYX_API_KEY not configured" });
    }

    const axios = (await import("axios")).default;
    const telnyxResponse = await axios.get("https://api.telnyx.com/v2/phone_numbers", {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'filter[phone_number]': phoneNumberE164,
      },
    });

    const telnyxNumbers = telnyxResponse.data?.data || [];
    if (telnyxNumbers.length === 0) {
      return res.status(404).json({ error: "Phone number not found in Telnyx account" });
    }

    // Check if number is already assigned to another business
    const { BusinessPhoneNumber } = await import("../models/BusinessPhoneNumber.js");
    const existing = await BusinessPhoneNumber.findByPhoneNumber(phoneNumberE164);
    
    if (existing && existing.business_id !== businessId) {
      const existingBusiness = await Business.findById(existing.business_id);
      return res.status(409).json({ 
        error: `Phone number is already assigned to business: ${existingBusiness?.name || existing.business_id}` 
      });
    }

    // Check if number is already assigned to this business
    const existingForBusiness = await BusinessPhoneNumber.findByBusinessId(businessId);
    const alreadyAssigned = existingForBusiness.find(n => n.phone_number === phoneNumberE164 && n.is_active);
    
    if (alreadyAssigned) {
      return res.status(409).json({ 
        error: "Phone number is already assigned to this business" 
      });
    }

    // Add phone number to business_phone_numbers table
    const phoneNumberRecord = await BusinessPhoneNumber.create(
      businessId, 
      phoneNumberE164, 
      is_primary || false
    );

    // Also update telnyx_number field for backwards compatibility (set as primary if it's the first)
    if (is_primary || existingForBusiness.length === 0) {
      await Business.update(businessId, {
        telnyx_number: phoneNumberE164,
      });
    }

    // Log admin activity (gracefully handle if table doesn't exist)
    try {
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        business_id: businessId,
        action: "assign_sms_number",
        details: { 
          phone_number: phoneNumberE164,
          business_name: business.name,
          is_primary: is_primary || false,
        },
      });
    } catch (logError) {
      console.warn('[Admin] Failed to log activity (table may not exist):', logError.message);
      // Continue without logging - don't fail the request
    }

    res.json({
      success: true,
      phone_number: phoneNumberE164,
      phone_number_id: phoneNumberRecord.id,
      business: {
        id: business.id,
        name: business.name,
      },
    });
  } catch (error) {
    console.error("Assign SMS number error:", error);
    res.status(500).json({ error: error.message || "Failed to assign SMS number" });
  }
});

// Remove phone number from business
router.delete("/phone-numbers/business/:businessId/:phoneNumberId", authenticateAdmin, async (req, res) => {
  try {
    const { businessId, phoneNumberId } = req.params;
    
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const { BusinessPhoneNumber } = await import("../models/BusinessPhoneNumber.js");
    
    // Verify the phone number belongs to this business
    const phoneNumber = await BusinessPhoneNumber.findByBusinessId(businessId);
    const numberRecord = phoneNumber.find(n => n.id === phoneNumberId);
    
    if (!numberRecord) {
      return res.status(404).json({ error: "Phone number not found for this business" });
    }

    // Remove the phone number
    await BusinessPhoneNumber.remove(phoneNumberId);

    // If this was the primary number, update telnyx_number field
    if (numberRecord.is_primary) {
      const remainingNumbers = await BusinessPhoneNumber.findActiveByBusinessId(businessId);
      const newPrimary = remainingNumbers.find(n => n.is_primary) || remainingNumbers[0];
      
      if (newPrimary) {
        await Business.update(businessId, {
          telnyx_number: newPrimary.phone_number,
        });
      } else {
        // No numbers left, clear telnyx_number
        await Business.update(businessId, {
          telnyx_number: null,
        });
      }
    }

    // Log admin activity (gracefully handle if table doesn't exist)
    try {
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        business_id: businessId,
        action: "remove_sms_number",
        details: { 
          phone_number: numberRecord.phone_number,
          business_name: business.name,
        },
      });
    } catch (logError) {
      console.warn('[Admin] Failed to log activity (table may not exist):', logError.message);
      // Continue without logging - don't fail the request
    }

    res.json({
      success: true,
      message: "Phone number removed successfully",
    });
  } catch (error) {
    console.error("Remove SMS number error:", error);
    res.status(500).json({ error: error.message || "Failed to remove SMS number" });
  }
});

// Rebuild a single AI assistant for a specific business
router.post("/accounts/:id/rebuild-assistant", authenticateAdmin, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    if (!business.vapi_assistant_id) {
      return res.status(400).json({ error: "No VAPI assistant found for this business" });
    }
    
    // CRITICAL: Verify business hours exist before rebuild
    const { AIAgent } = await import("../models/AIAgent.js");
    const agent = await AIAgent.findByBusinessId(req.params.id);
    
    console.log(`[Admin Rebuild] ========== PRE-REBUILD CHECK ==========`);
    console.log(`[Admin Rebuild] Business: ${business.name} (${business.id})`);
    console.log(`[Admin Rebuild] Agent exists:`, !!agent);
    if (agent) {
      console.log(`[Admin Rebuild] business_hours exists:`, !!agent.business_hours);
      console.log(`[Admin Rebuild] business_hours type:`, typeof agent.business_hours);
      console.log(`[Admin Rebuild] business_hours keys:`, agent.business_hours ? Object.keys(agent.business_hours) : 'N/A');
      console.log(`[Admin Rebuild] holiday_hours exists:`, !!agent.holiday_hours);
      console.log(`[Admin Rebuild] holiday_hours count:`, agent.holiday_hours ? agent.holiday_hours.length : 0);
      if (agent.business_hours) {
        console.log(`[Admin Rebuild] business_hours data:`, JSON.stringify(agent.business_hours, null, 2));
      }
    } else {
      console.warn(`[Admin Rebuild] ⚠️ No agent found for business ${business.id}`);
    }
    console.log(`[Admin Rebuild] =======================================`);
    
    const { rebuildAssistant } = await import("../services/vapi.js");
    
    console.log(`[Admin] Rebuilding assistant for business: ${business.name} (${business.id})`);
    await rebuildAssistant(business.id);
    
    // Log activity
    try {
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        business_id: req.params.id,
        action: "rebuild_assistant",
        details: { 
          assistant_id: business.vapi_assistant_id,
          business_name: business.name,
        },
      });
    } catch (logError) {
      console.warn('[Admin] Failed to log activity (non-blocking):', logError.message);
    }
    
    res.json({
      success: true,
      message: `Assistant rebuilt successfully for ${business.name}`,
    });
  } catch (error) {
    console.error("Rebuild assistant error:", error);
    res.status(500).json({ 
      error: "Failed to rebuild assistant",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rebuild all AI assistants (for global changes)
router.post("/rebuild-all-assistants", authenticateAdmin, async (req, res) => {
  try {
    const { supabaseClient } = await import("../config/database.js");
    const { rebuildAssistant } = await import("../services/vapi.js");
    
    // Get all businesses with VAPI assistants
    const { data: businesses, error } = await supabaseClient
      .from("businesses")
      .select("id, name, vapi_assistant_id")
      .is("deleted_at", null)
      .not("vapi_assistant_id", "is", null);
    
    if (error) throw error;
    
    if (!businesses || businesses.length === 0) {
      return res.json({
        success: true,
        message: "No businesses with VAPI assistants found",
        total: 0,
        successful: 0,
        failed: 0,
        results: [],
      });
    }
    
    console.log(`[Admin] Rebuilding ${businesses.length} AI assistants...`);
    
    const results = [];
    let successful = 0;
    let failed = 0;
    
    // Rebuild assistants sequentially to avoid rate limits
    for (const business of businesses) {
      try {
        console.log(`[Admin] Rebuilding assistant for business: ${business.name} (${business.id})`);
        await rebuildAssistant(business.id);
        results.push({
          business_id: business.id,
          business_name: business.name,
          status: "success",
        });
        successful++;
      } catch (error) {
        console.error(`[Admin] Failed to rebuild assistant for ${business.name}:`, error.message);
        results.push({
          business_id: business.id,
          business_name: business.name,
          status: "failed",
          error: error.message,
        });
        failed++;
      }
    }
    
    // Log activity
    try {
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        action: "rebuild_all_assistants",
        details: {
          total: businesses.length,
          successful,
          failed,
        },
      });
    } catch (logError) {
      console.warn('[Admin] Failed to log activity (non-blocking):', logError.message);
    }
    
    res.json({
      success: true,
      message: `Rebuilt ${successful} of ${businesses.length} assistants`,
      total: businesses.length,
      successful,
      failed,
      results,
    });
  } catch (error) {
    console.error("Rebuild all assistants error:", error);
    res.status(500).json({ 
      error: "Failed to rebuild all assistants",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get agent data for a business (admin)
router.get("/accounts/:id/agent", authenticateAdmin, async (req, res) => {
  try {
    const { AIAgent } = await import("../models/AIAgent.js");
    const business = await Business.findById(req.params.id);
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    const agent = await AIAgent.findByBusinessId(req.params.id);
    
    res.json({ 
      agent: agent || null,
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        address: business.address,
        timezone: business.timezone,
        public_phone_number: business.public_phone_number,
      },
    });
  } catch (error) {
    console.error("Get agent data error:", error);
    res.status(500).json({ error: "Failed to get agent data" });
  }
});

// Update agent data for a business (admin)
router.put("/accounts/:id/agent", authenticateAdmin, async (req, res) => {
  try {
    const { AIAgent } = await import("../models/AIAgent.js");
    const { rebuildAssistant } = await import("../services/vapi.js");
    const business = await Business.findById(req.params.id);
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    const {
      business_hours,
      faqs,
      opening_greeting,
      ending_greeting,
      holiday_hours,
      voice_settings,
    } = req.body;
    
    // Normalize holiday hours dates to ensure they're in YYYY-MM-DD format
    let normalizedHolidayHours = holiday_hours;
    if (holiday_hours && Array.isArray(holiday_hours)) {
      normalizedHolidayHours = holiday_hours.map(h => {
        if (!h || !h.date) return h;
        
        // Ensure date is in YYYY-MM-DD format (timezone-agnostic)
        let dateStr = h.date;
        
        // If it's a Date object, extract the date parts in local timezone
        if (dateStr instanceof Date) {
          const year = dateStr.getFullYear();
          const month = String(dateStr.getMonth() + 1).padStart(2, '0');
          const day = String(dateStr.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        } 
        // If it's an ISO string with time, extract just the date part
        else if (typeof dateStr === 'string' && dateStr.includes('T')) {
          dateStr = dateStr.split('T')[0];
        }
        // If it's already in YYYY-MM-DD format, use it as-is
        else if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          // Already in correct format, use as-is
          dateStr = dateStr;
        }
        // If it's in a different format, try to parse it
        else if (typeof dateStr === 'string') {
          // Try to extract YYYY-MM-DD from various formats
          const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (dateMatch) {
            dateStr = dateMatch[0]; // Use the matched YYYY-MM-DD
          } else {
            console.warn(`[Admin Agent Update] Could not parse holiday date: ${dateStr}, using as-is`);
          }
        }
        
        return { ...h, date: dateStr };
      });
    }
    
    // Get existing agent or create one
    let agent = await AIAgent.findByBusinessId(req.params.id);
    
    const updateData = {};
    if (business_hours !== undefined) updateData.business_hours = business_hours;
    if (faqs !== undefined) updateData.faqs = faqs;
    if (opening_greeting !== undefined) updateData.opening_greeting = opening_greeting;
    if (ending_greeting !== undefined) updateData.ending_greeting = ending_greeting;
    if (normalizedHolidayHours !== undefined) updateData.holiday_hours = normalizedHolidayHours;
    if (voice_settings !== undefined) updateData.voice_settings = voice_settings;
    
    if (agent) {
      // Update existing agent
      agent = await AIAgent.update(req.params.id, updateData);
    } else {
      // Create new agent
      agent = await AIAgent.create({
        business_id: req.params.id,
        ...updateData,
      });
    }
    
    // Rebuild assistant to apply changes
    if (business.vapi_assistant_id) {
      try {
        await rebuildAssistant(req.params.id);
        console.log(`[Admin] Assistant rebuilt after agent update for business: ${business.name}`);
      } catch (rebuildError) {
        console.error(`[Admin] Failed to rebuild assistant (non-blocking):`, rebuildError.message);
        // Don't fail the request if rebuild fails
      }
    }
    
    // Log activity
    try {
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        business_id: req.params.id,
        action: "update_agent_data",
        details: {
          fields_updated: Object.keys(updateData),
          business_name: business.name,
        },
      });
    } catch (logError) {
      console.warn('[Admin] Failed to log activity (non-blocking):', logError.message);
    }
    
    res.json({ 
      success: true,
      agent,
      message: "Agent data updated successfully",
    });
  } catch (error) {
    console.error("Update agent data error:", error);
    res.status(500).json({ 
      error: "Failed to update agent data",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Invoice Settings routes
router.get('/invoice-settings', authenticateAdmin, async (req, res) => {
  try {
    const { InvoiceSettings } = await import('../models/InvoiceSettings.js');
    const settings = await InvoiceSettings.get();
    res.json({ settings: settings || {} });
  } catch (error) {
    console.error('Get invoice settings error:', error);
    res.status(500).json({ error: 'Failed to get invoice settings' });
  }
});

router.put('/invoice-settings', authenticateAdmin, async (req, res) => {
  try {
    const { InvoiceSettings } = await import('../models/InvoiceSettings.js');
    const settings = await InvoiceSettings.update(req.body);
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: 'update_invoice_settings',
      details: { updated_fields: Object.keys(req.body) },
    });
    
    res.json({ settings });
  } catch (error) {
    console.error('Update invoice settings error:', error);
    res.status(500).json({ error: 'Failed to update invoice settings' });
  }
});

// Get website analytics
router.get("/website-analytics", authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate, event_name, category, location } = req.query;
    const { supabaseClient } = await import("../config/database.js");

    let query = supabaseClient
      .from("website_analytics")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10000); // Limit to prevent huge queries

    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }
    if (event_name) {
      query = query.eq("event_name", event_name);
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (location) {
      query = query.eq("location", location);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("[Admin Website Analytics] Error:", error);
      return res.status(500).json({ error: "Failed to fetch website analytics" });
    }

    // Calculate summary statistics
    const summary = {
      total_events: events?.length || 0,
      by_event_name: {},
      by_category: {},
      by_location: {},
      by_label: {},
      unique_paths: new Set(),
      date_range: {
        earliest: null,
        latest: null,
      },
    };

    if (events && events.length > 0) {
      events.forEach((event) => {
        // Count by event name
        summary.by_event_name[event.event_name] = (summary.by_event_name[event.event_name] || 0) + 1;

        // Count by category
        if (event.category) {
          summary.by_category[event.category] = (summary.by_category[event.category] || 0) + 1;
        }

        // Count by location
        if (event.location) {
          summary.by_location[event.location] = (summary.by_location[event.location] || 0) + 1;
        }

        // Count by label
        if (event.label) {
          summary.by_label[event.label] = (summary.by_label[event.label] || 0) + 1;
        }

        // Track paths
        if (event.path) {
          summary.unique_paths.add(event.path);
        }

        // Track date range
        const eventDate = new Date(event.created_at);
        if (!summary.date_range.earliest || eventDate < new Date(summary.date_range.earliest)) {
          summary.date_range.earliest = event.created_at;
        }
        if (!summary.date_range.latest || eventDate > new Date(summary.date_range.latest)) {
          summary.date_range.latest = event.created_at;
        }
      });

      summary.unique_paths = Array.from(summary.unique_paths);
    }

    res.json({
      events: events || [],
      summary: summary,
    });
  } catch (error) {
    console.error("[Admin Website Analytics] Error:", error);
    res.status(500).json({ error: "Failed to get website analytics" });
  }
});

export default router;

