// services/billing.js
// Billing cycle management, prorated upgrades, minutes exhaustion handling

import { Business } from "../models/Business.js";
import { resetBillingCycle } from "./usage.js";

/**
 * Calculate billing cycle dates for a business
 * Billing cycle: Same calendar day each month as signup
 */
export function calculateBillingCycle(business) {
  const now = new Date();
  const billingDay = business.billing_day || now.getDate();
  
  // Get next billing date or calculate from signup
  let nextBillingDate = business.next_billing_date
    ? new Date(business.next_billing_date)
    : calculateNextBillingDate(billingDay);

  // If next billing date is in the past, move to next month
  if (nextBillingDate <= now) {
    nextBillingDate = calculateNextBillingDate(billingDay);
  }

  // Calculate current cycle start and end
  const cycleStart = new Date(nextBillingDate);
  cycleStart.setMonth(cycleStart.getMonth() - 1);
  
  const cycleEnd = new Date(nextBillingDate);
  cycleEnd.setDate(cycleEnd.getDate() - 1);

  return {
    start: cycleStart,
    end: cycleEnd,
    next: nextBillingDate,
    billingDay,
  };
}

/**
 * Calculate next billing date from billing day
 */
function calculateNextBillingDate(billingDay) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // Get last day of current month
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  
  // Use billing day, or last day of month if billing day exceeds month length
  const day = Math.min(billingDay, lastDayOfMonth);
  
  let nextDate = new Date(year, month, day);
  
  // If billing day has passed this month, move to next month
  if (nextDate <= now) {
    nextDate = new Date(year, month + 1, day);
    
    // Handle month-end edge cases (e.g., signup on 31st)
    const lastDayOfNextMonth = new Date(year, month + 2, 0).getDate();
    if (day > lastDayOfNextMonth) {
      nextDate = new Date(year, month + 2, 0); // Last day of next month
    }
  }
  
  return nextDate;
}

/**
 * Initialize billing cycle for new business
 */
export function initializeBillingCycle(businessId, signupDate) {
  const signup = new Date(signupDate);
  const billingDay = signup.getDate();
  const nextBillingDate = calculateNextBillingDate(billingDay);
  
  return Business.update(businessId, {
    billing_day: billingDay,
    next_billing_date: nextBillingDate.toISOString().split("T")[0],
  });
}

/**
 * Handle plan upgrade with prorated billing
 */
export async function handlePlanUpgrade(businessId, newPlanTier, newPlanPrice) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  const billingCycle = calculateBillingCycle(business);
  const now = new Date();
  
  // Calculate days remaining in current billing cycle
  const daysRemaining = Math.ceil((billingCycle.next - now) / (1000 * 60 * 60 * 24));
  const totalDaysInPeriod = Math.ceil((billingCycle.next - billingCycle.start) / (1000 * 60 * 60 * 24));
  
  // Get current plan price
  const currentPlanPrice = business.custom_pricing_monthly || getPlanPrice(business.plan_tier);
  const newPlanPriceDecimal = parseFloat(newPlanPrice);
  
  // Calculate prorated amount
  const dailyRateOld = currentPlanPrice / totalDaysInPeriod;
  const dailyRateNew = newPlanPriceDecimal / totalDaysInPeriod;
  const proratedAmount = (dailyRateNew - dailyRateOld) * daysRemaining;
  
  // Update business plan
  await Business.update(businessId, {
    plan_tier: newPlanTier,
    usage_limit_minutes: getPlanMinutes(newPlanTier),
    // Billing date does NOT change on upgrade
  });
  
  // Generate prorated invoice
  const { generateInvoice } = await import("./invoices.js");
  await generateInvoice(businessId, {
    invoice_type: "upgrade",
    amount: Math.abs(proratedAmount),
    prorated_amount: Math.abs(proratedAmount),
    prorated_days: daysRemaining,
    period_start: now.toISOString().split("T")[0],
    period_end: billingCycle.next.toISOString().split("T")[0],
  });
  
  return {
    proratedAmount: Math.abs(proratedAmount),
    proratedDays: daysRemaining,
    newPlanTier,
    billingDateUnchanged: true,
  };
}

/**
 * Get plan price by tier
 */
function getPlanPrice(tier) {
  const prices = {
    starter: 79,
    core: 129,
    pro: 179,
  };
  return prices[tier] || 79;
}

/**
 * Get plan minutes by tier
 */
function getPlanMinutes(tier) {
  const minutes = {
    starter: 250,
    core: 500,
    pro: 750,
  };
  return minutes[tier] || 250;
}

/**
 * Check and process billing cycle reset
 * Should be called daily via cron job
 */
export async function processBillingCycleResets() {
  const now = new Date();
  const today = now.getDate();
  
  // Find businesses with billing day = today
  const { data: businesses, error } = await supabaseClient
    .from("businesses")
    .select("id, billing_day, next_billing_date")
    .eq("billing_day", today)
    .is("deleted_at", null);
  
  if (error) {
    console.error("Error finding businesses for billing reset:", error);
    return;
  }
  
  for (const business of businesses || []) {
    const nextBillingDate = new Date(business.next_billing_date);
    const nextBillingDateOnly = nextBillingDate.toISOString().split("T")[0];
    const todayOnly = now.toISOString().split("T")[0];
    
    // Only reset if next billing date is today
    if (nextBillingDateOnly === todayOnly) {
      await resetBillingCycle(business.id);
      
      // Update next billing date to next month
      const newNextBillingDate = calculateNextBillingDate(business.billing_day);
      await Business.update(business.id, {
        next_billing_date: newNextBillingDate.toISOString().split("T")[0],
      });
    }
  }
}

import { supabaseClient } from "../config/database.js";



















