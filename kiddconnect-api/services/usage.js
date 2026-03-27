// services/usage.js
// Usage tracking and minutes management

import { Business } from "../models/Business.js";
import { UsageMinutes } from "../models/UsageMinutes.js";
import { calculateBillingCycle } from "./billing.js";
import { supabaseClient } from "../config/database.js";
import {
  sendMinutesAlmostUsedNotification,
  sendMinutesFullyUsedNotification,
  sendOverageChargesNotification,
  sendAIDisabledNotification,
} from "./notifications.js";
import { Notification } from "../models/v2/Notification.js";

/**
 * Check if minutes are available for a call
 * Returns: { available: boolean, reason: string, action: string, notificationSent: boolean, overageMinutes: number }
 */
export async function checkMinutesAvailable(businessId, callDurationMinutes = 0) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  // Get current billing cycle
  const billingCycle = calculateBillingCycle(business);
  const now = new Date();

  // Get usage for current billing cycle
  const usage = await getCurrentCycleUsage(businessId, billingCycle.start, billingCycle.end);
  const totalMinutesUsed = usage.totalMinutes;
  const overageMinutes = usage.overageMinutes;

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
  
  // Calculate available minutes (plan limit + bonus - used)
  const bonusMinutes = business.bonus_minutes || 0;
  const totalAvailable = planLimit + bonusMinutes;
  const minutesRemaining = totalAvailable - totalMinutesUsed;

  // CRITICAL: Re-enable AI if minutes are now available and AI was disabled due to exhaustion
  if (!business.ai_enabled && totalMinutesUsed < totalAvailable) {
    console.log(`[Usage] ✅ Minutes available again (${minutesRemaining} remaining), re-enabling AI for business ${businessId}`);
    await Business.update(businessId, { ai_enabled: true });
    // Refresh business object to get updated ai_enabled value
    const updatedBusiness = await Business.findById(businessId);
    if (updatedBusiness) {
      business.ai_enabled = true;
    }
  }

  // Check usage threshold (before checking exhaustion)
  const usagePercent = totalAvailable > 0 ? (totalMinutesUsed / totalAvailable) * 100 : 0;
  const threshold = business.usage_threshold_percent || 80;

  if (usagePercent >= threshold && business.notify_minutes_almost_used && !usage.thresholdNotificationSent) {
    // Send threshold notification
    await sendMinutesAlmostUsedNotification(
      business,
      totalMinutesUsed,
      totalAvailable,
      minutesRemaining,
      billingCycle.end
    );
    
    // Create in-app notification for usage limit warning
    try {
      await Notification.create({
        business_id: business.id,
        user_id: null, // All users in organization see this
        type: 'limit',
        message: `You've used ${Math.round(usagePercent)}% of your monthly minutes (${totalMinutesUsed} of ${totalAvailable} minutes). Limit resets on ${billingCycle.end.toLocaleDateString()}.`,
        metadata: {
          module_key: 'phone-agent',
          minutes_used: totalMinutesUsed,
          minutes_total: totalAvailable,
          minutes_remaining: minutesRemaining,
          usage_percent: Math.round(usagePercent),
          reset_date: billingCycle.end.toISOString(),
        },
      });
      console.log(`[Usage] ✅ In-app notification created for usage limit warning`);
    } catch (notifError) {
      console.error(`[Usage] ⚠️ Failed to create usage limit notification (non-blocking):`, notifError);
    }
    
    // Mark as sent (would need to track this in database)
  }

  // Check if minutes are exhausted
  if (totalMinutesUsed >= totalAvailable) {
    // Minutes exhausted
    if (business.minutes_exhausted_behavior === "disable_ai") {
      // Option A: Disable AI (only if not already disabled to avoid unnecessary updates)
      if (business.ai_enabled) {
        await Business.update(businessId, { ai_enabled: false });
        
        // Send mandatory notification
        await sendAIDisabledNotification(business, "minutes_exhausted", {
          minutesTotal: totalAvailable,
          resetDate: billingCycle.end,
        });

        // Send optional notification if enabled
        if (business.notify_minutes_fully_used) {
          await sendMinutesFullyUsedNotification(business, totalAvailable, billingCycle.end, true);
        }

        // Create in-app notification for minutes exhausted
        try {
          await Notification.create({
            business_id: business.id,
            user_id: null, // All users in organization see this
            type: 'warning',
            message: `Monthly minutes exhausted (${totalMinutesUsed}/${totalAvailable}). AI has been disabled. Resets on ${billingCycle.end.toLocaleDateString()}.`,
            metadata: {
              module_key: 'phone-agent',
              minutes_used: totalMinutesUsed,
              minutes_total: totalAvailable,
              reset_date: billingCycle.end.toISOString(),
              ai_disabled: true,
            },
          });
          console.log(`[Usage] ✅ In-app notification created for minutes exhausted`);
        } catch (notifError) {
          console.error(`[Usage] ⚠️ Failed to create minutes exhausted notification (non-blocking):`, notifError);
        }
      }

      return {
        available: false,
        reason: "minutes_exhausted",
        action: "disable_ai",
        notificationSent: true,
        overageMinutes: 0,
      };
    } else if (business.minutes_exhausted_behavior === "allow_overage") {
      // Option B: Check overage cap
      if (business.overage_cap_minutes && overageMinutes >= business.overage_cap_minutes) {
        // Cap reached, disable AI
        await Business.update(businessId, { ai_enabled: false });
        
        await sendAIDisabledNotification(business, "overage_cap", {
          overageCap: business.overage_cap_minutes,
          resetDate: billingCycle.end,
        });

        return {
          available: false,
          reason: "overage_cap_reached",
          action: "disable_ai",
          notificationSent: true,
          overageMinutes,
        };
      }

      // Under cap, allow with overage billing
      if (business.notify_overage_charges) {
        await sendOverageChargesNotification(
          business,
          overageMinutes + callDurationMinutes,
          getOverageRate(business),
          calculateOverageCharge(business, overageMinutes + callDurationMinutes),
          business.overage_cap_minutes
        );
      }

      if (business.notify_minutes_fully_used && !usage.minutesExhaustedNotificationSent) {
        await sendMinutesFullyUsedNotification(business, totalAvailable, billingCycle.end, false);
      }

      return {
        available: true,
        reason: "overage_billing",
        action: "charge_overage",
        notificationSent: true,
        overageMinutes: overageMinutes + callDurationMinutes,
      };
    }
  }

  // Minutes available
  return {
    available: true,
    reason: "minutes_available",
    action: "proceed",
    notificationSent: false,
    overageMinutes: 0,
  };
}

/**
 * Record call usage
 */
export async function recordCallUsage(businessId, callSessionId, minutesUsed) {
  console.log(`[Usage] ========== RECORD CALL USAGE START ==========`);
  console.log(`[Usage] businessId: ${businessId}`);
  console.log(`[Usage] callSessionId: ${callSessionId}`);
  console.log(`[Usage] minutesUsed: ${minutesUsed} (type: ${typeof minutesUsed})`);
  
  // Ensure minutesUsed is a number
  const minutes = typeof minutesUsed === 'number' ? minutesUsed : parseFloat(minutesUsed) || 0;
  console.log(`[Usage] Normalized minutes: ${minutes}`);
  
  if (minutes <= 0) {
    console.warn(`[Usage] ⚠️ Minutes is 0 or negative, skipping usage record`);
    return;
  }
  
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  const now = new Date();
  const billingCycle = calculateBillingCycle(business);

  console.log(`[Usage] Billing cycle: ${billingCycle.start.toISOString()} to ${billingCycle.end.toISOString()}`);

  // Determine if this is overage
  const usage = await getCurrentCycleUsage(businessId, billingCycle.start, billingCycle.end);
  
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
  
  const bonusMinutes = business.bonus_minutes || 0;
  const totalAvailable = planLimit + bonusMinutes;
  const isOverage = usage.totalMinutes >= totalAvailable;

  console.log(`[Usage] Current usage: ${usage.totalMinutes} / ${totalAvailable}, isOverage: ${isOverage}`);

  // Check if usage record already exists for this call session (prevent duplicates)
  const existingUsage = await UsageMinutes.findByCallSessionId(callSessionId);
  if (existingUsage) {
    console.log(`[Usage] ⚠️ Usage record already exists for call_session_id: ${callSessionId}`);
    console.log(`[Usage] Existing record:`, {
      id: existingUsage.id,
      minutes_used: existingUsage.minutes_used,
      created_at: existingUsage.created_at,
    });
    console.log(`[Usage] Skipping duplicate usage record creation`);
    return existingUsage;
  }

  // Record usage
  try {
    const usageData = {
      business_id: businessId,
      call_session_id: callSessionId,
      minutes_used: minutes,
      date: now.toISOString().split("T")[0],
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      billing_cycle_start: billingCycle.start,
      billing_cycle_end: billingCycle.end,
    };
    console.log(`[Usage] Creating usage record with data:`, JSON.stringify(usageData, null, 2));
    
    const created = await UsageMinutes.create(usageData);
    
    if (!created || !created.id) {
      console.error(`[Usage] ❌❌❌ Usage record creation returned null/undefined!`);
      console.error(`[Usage] Created record:`, created);
      throw new Error("Usage record creation failed - no record returned");
    }
    
    console.log(`[Usage] ✅✅✅ Usage record created successfully:`, {
      id: created.id,
      business_id: created.business_id,
      call_session_id: created.call_session_id,
      minutes_used: created.minutes_used,
      date: created.date,
      created_at: created.created_at,
    });
    console.log(`[Usage] ========== RECORD CALL USAGE SUCCESS ==========`);
    return created;
  } catch (error) {
    console.error(`[Usage] ========== RECORD CALL USAGE ERROR ==========`);
    console.error(`[Usage] Error name:`, error.name);
    console.error(`[Usage] Error creating usage record:`, error);
    console.error(`[Usage] Error message:`, error.message);
    console.error(`[Usage] Error code:`, error.code);
    console.error(`[Usage] Error stack:`, error.stack);
    console.error(`[Usage] Full error:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    throw error;
  }

  // If overage, calculate and record overage charges
  if (isOverage && business.overage_billing_enabled) {
    const overageRate = getOverageRate(business);
    const overageCharge = minutesUsed * overageRate;
    
    console.log(`[Usage] Overage charge: ${overageCharge} for ${minutesUsed} minutes`);
    // Record overage in billing service
    // This will be handled by billing service
  }
}

/**
 * Get current billing cycle usage
 */
export async function getCurrentCycleUsage(businessId, cycleStart, cycleEnd) {
  console.log(`[Usage] ========== GET CURRENT CYCLE USAGE START ==========`);
  console.log(`[Usage] businessId: ${businessId}`);
  console.log(`[Usage] cycleStart: ${cycleStart}`);
  console.log(`[Usage] cycleEnd: ${cycleEnd}`);
  
  // Use the model method which has proper fallback handling
  try {
    const usage = await UsageMinutes.getCurrentCycleUsage(businessId, cycleStart, cycleEnd);
    console.log(`[Usage] Current cycle usage for business ${businessId}:`, JSON.stringify(usage, null, 2));
    const result = {
      totalMinutes: usage.totalMinutes || 0,
      overageMinutes: usage.overageMinutes || 0,
      thresholdNotificationSent: false, // TODO: Track in database
      minutesExhaustedNotificationSent: false, // TODO: Track in database
    };
    console.log(`[Usage] Returning usage result:`, JSON.stringify(result, null, 2));
    console.log(`[Usage] ========== GET CURRENT CYCLE USAGE SUCCESS ==========`);
    return result;
  } catch (error) {
    console.error("[Usage] ========== GET CURRENT CYCLE USAGE ERROR ==========");
    console.error("[Usage] Error getting usage:", error);
    console.error("[Usage] Error message:", error.message);
    console.error("[Usage] Error stack:", error.stack);
    
    // Fallback: try date-based query
    try {
      console.log("[Usage] Attempting fallback date-based query...");
      const cycleStartStr = cycleStart instanceof Date ? cycleStart.toISOString().split("T")[0] : cycleStart;
      const cycleEndStr = cycleEnd instanceof Date ? cycleEnd.toISOString().split("T")[0] : cycleEnd;
      
      console.log(`[Usage] Querying usage_minutes table for date range: ${cycleStartStr} to ${cycleEndStr}`);
      
      const { data, error: dateError } = await supabaseClient
        .from("usage_minutes")
        .select("minutes_used")
        .eq("business_id", businessId)
        .gte("date", cycleStartStr)
        .lte("date", cycleEndStr);

      if (dateError) {
        console.error("[Usage] Date-based query also failed:", dateError);
        return { totalMinutes: 0, overageMinutes: 0 };
      }

      console.log(`[Usage] Found ${data?.length || 0} usage records`);
      const totalMinutes = data?.reduce((sum, row) => {
        const minutes = parseFloat(row.minutes_used || 0);
        console.log(`[Usage] Adding ${minutes} minutes from record`);
        return sum + minutes;
      }, 0) || 0;
      
      console.log(`[Usage] Total minutes from query: ${totalMinutes}`);
      
      const business = await Business.findById(businessId);
      const planLimit = business?.usage_limit_minutes || 0;
      const bonusMinutes = business?.bonus_minutes || 0;
      const totalAvailable = planLimit + bonusMinutes;
      const overageMinutes = Math.max(0, totalMinutes - totalAvailable);

      const result = {
        totalMinutes,
        overageMinutes,
        thresholdNotificationSent: false,
        minutesExhaustedNotificationSent: false,
      };
      console.log(`[Usage] Fallback query result:`, JSON.stringify(result, null, 2));
      return result;
    } catch (fallbackError) {
      console.error("[Usage] Fallback query failed:", fallbackError);
      return { totalMinutes: 0, overageMinutes: 0 };
    }
  }
}

/**
 * Get overage rate for business (custom or plan rate)
 */
function getOverageRate(business) {
  if (business.custom_pricing_overage) {
    return parseFloat(business.custom_pricing_overage);
  }

  // Plan-based rates
  const planRates = {
    starter: 0.30,
    core: 0.25,
    pro: 0.20,
  };

  return planRates[business.plan_tier] || 0.30;
}

/**
 * Calculate overage charge
 */
function calculateOverageCharge(business, overageMinutes) {
  const rate = getOverageRate(business);
  return overageMinutes * rate;
}

/**
 * Reset billing cycle (called on billing cycle start)
 */
export async function resetBillingCycle(businessId) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  const billingCycle = calculateBillingCycle(business);
  
  // Reset bonus minutes if needed (they don't roll over)
  // Reset notification flags
  // Re-enable AI if it was disabled due to minutes exhaustion
  if (!business.ai_enabled) {
    // Check if it was disabled due to minutes
    // If so, re-enable it
    await Business.update(businessId, { ai_enabled: true });
    
    // Send AI resumed notification
    const { sendAIResumedNotification } = await import("./notifications.js");
    await sendAIResumedNotification(
      business,
      business.usage_limit_minutes,
      billingCycle.end
    );
  }
}
