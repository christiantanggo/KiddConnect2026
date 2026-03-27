import express from 'express';
import { UsageMinutes } from '../models/UsageMinutes.js';
import { Business } from '../models/Business.js';
import { authenticate } from '../middleware/auth.js';
import { calculateBillingCycle } from '../services/billing.js';
import { getCurrentCycleUsage } from '../services/usage.js';

const router = express.Router();

// Get usage status
router.get('/status', authenticate, async (req, res) => {
  console.log('[Usage API] ========== GET USAGE STATUS START ==========');
  console.log('[Usage API] businessId:', req.businessId);
  
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      console.error('[Usage API] Business not found');
      return res.status(404).json({ error: 'Business not found' });
    }

    console.log('[Usage API] Business found:', {
      id: business.id,
      name: business.name,
      usage_limit_minutes: business.usage_limit_minutes,
      bonus_minutes: business.bonus_minutes,
      billing_day: business.billing_day,
      next_billing_date: business.next_billing_date,
    });

    // Initialize billing cycle if not set
    if (!business.billing_day || !business.next_billing_date) {
      console.log('[Usage API] Billing cycle not initialized, initializing...');
      const { initializeBillingCycle } = await import('../services/billing.js');
      await initializeBillingCycle(business.id, business.created_at || new Date());
      // Reload business to get updated billing info
      const updatedBusiness = await Business.findById(req.businessId);
      Object.assign(business, updatedBusiness);
    }

    const billingCycle = calculateBillingCycle(business);
    console.log('[Usage API] Billing cycle:', {
      start: billingCycle.start.toISOString(),
      end: billingCycle.end.toISOString(),
      next: billingCycle.next.toISOString(),
    });
    
    const usage = await getCurrentCycleUsage(req.businessId, billingCycle.start, billingCycle.end);
    console.log('[Usage API] Usage data:', JSON.stringify(usage, null, 2));
    
    // Get minutes from package if business has one, otherwise use business.usage_limit_minutes
    let planLimit = business.usage_limit_minutes || 0;
    
    if (business.package_id) {
      const { PricingPackage } = await import('../models/PricingPackage.js');
      const pkg = await PricingPackage.findById(business.package_id);
      
      if (pkg) {
        console.log('[Usage API] Package found:', {
          package_id: pkg.id,
          package_name: pkg.name,
          minutes_included: pkg.minutes_included,
        });
        
        // Use package minutes
        planLimit = pkg.minutes_included || 0;
        
        // Sync business.usage_limit_minutes with package if they don't match
        if (business.usage_limit_minutes !== pkg.minutes_included) {
          console.log('[Usage API] Syncing usage_limit_minutes from package:', {
            old: business.usage_limit_minutes,
            new: pkg.minutes_included,
          });
          await Business.update(business.id, {
            usage_limit_minutes: pkg.minutes_included,
          });
        }
      } else {
        console.warn('[Usage API] Package not found for package_id:', business.package_id);
      }
    }
    
    const bonusMinutes = business.bonus_minutes || 0;
    const totalAvailable = planLimit + bonusMinutes;
    const minutesRemaining = Math.max(0, totalAvailable - usage.totalMinutes);
    const usagePercent = totalAvailable > 0 ? (usage.totalMinutes / totalAvailable) * 100 : 0;

    const response = {
      minutes_used: usage.totalMinutes || 0,
      minutes_total: totalAvailable,
      minutes_remaining: minutesRemaining,
      usage_percent: Math.round(usagePercent),
      overage_minutes: usage.overageMinutes || 0,
      billing_cycle_start: billingCycle.start.toISOString().split('T')[0],
      billing_cycle_end: billingCycle.end.toISOString().split('T')[0],
      next_billing_date: billingCycle.next.toISOString().split('T')[0],
    };
    
    console.log('[Usage API] Response:', JSON.stringify(response, null, 2));
    console.log('[Usage API] ========== GET USAGE STATUS SUCCESS ==========');
    res.json(response);
  } catch (error) {
    console.error('[Usage API] ========== GET USAGE STATUS ERROR ==========');
    console.error('Get usage status error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Return a safe default response instead of error
    const safeResponse = {
      minutes_used: 0,
      minutes_total: 0,
      minutes_remaining: 0,
      usage_percent: 0,
      overage_minutes: 0,
      billing_cycle_start: new Date().toISOString().split('T')[0],
      billing_cycle_end: new Date().toISOString().split('T')[0],
      next_billing_date: new Date().toISOString().split('T')[0],
    };
    
    res.status(200).json(safeResponse);
  }
});

// Get monthly usage
router.get('/monthly', authenticate, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    
    const usage = await UsageMinutes.getMonthlyUsage(req.businessId, year, month);
    
    res.json({
      year,
      month,
      minutes: usage,
    });
  } catch (error) {
    console.error('Get monthly usage error:', error);
    res.status(500).json({ error: 'Failed to get monthly usage' });
  }
});

export default router;

