import { AuditLog } from '../../models/v2/AuditLog.js';
import { Notification } from '../../models/v2/Notification.js';
import { UsageLog } from '../../models/v2/UsageLog.js';
import { calculateBillingCycle } from '../../services/billing.js';

/**
 * checkUsageLimits Middleware
 * Checks usage_logs against subscription.usage_limit
 * Uses business billing cycle (shared across all modules)
 */
export const checkUsageLimits = async (req, res, next) => {
  try {
    const businessId = req.active_business_id;
    const subscription = req.subscription; // From verifySubscriptionWithStripe
    const moduleKey = req.params.moduleKey || req.body.module_key || req.query.module_key || req.module_key || 'reviews';
    
    if (!subscription) {
      return res.status(403).json({
        error: 'Subscription required',
        code: 'SUBSCRIPTION_REQUIRED'
      });
    }
    
    // If no usage limit set, allow unlimited usage
    if (!subscription.usage_limit || subscription.usage_limit <= 0) {
      req.usage_status = {
        used: 0,
        limit: null,
        remaining: null,
        percent_used: 0
      };
      return next();
    }
    
    // Use business billing cycle (shared across all modules)
    const business = req.business;
    const billingCycle = calculateBillingCycle(business);
    
    // Query usage_logs for current billing cycle
    const usageData = await UsageLog.getTotalUsage(
      businessId,
      moduleKey,
      billingCycle.start.toISOString(),
      billingCycle.end.toISOString()
    );
    
    const totalUsed = usageData.total || 0;
    const limit = subscription.usage_limit;
    const remaining = Math.max(0, limit - totalUsed);
    const percentUsed = limit > 0 ? (totalUsed / limit) * 100 : 0;
    
    // Check if limit reached
    if (totalUsed >= limit) {
      // Check if notification already sent recently
      const recentNotifications = await Notification.findByBusinessId(businessId);
      const hasRecentLimitNotification = recentNotifications.some(n =>
        n.type === 'warning' &&
        n.metadata?.module_key === moduleKey &&
        n.metadata?.action === 'usage_limit_reached' &&
        new Date(n.created_at) > new Date(Date.now() - 86400000) // Last 24 hours
      );
      
      if (!hasRecentLimitNotification) {
        // Create notification
        await Notification.create({
          business_id: businessId,
          user_id: null,
          type: 'warning',
          message: `You've reached your ${moduleKey} usage limit (${totalUsed}/${limit}). Upgrade your plan to continue.`,
          metadata: {
            module_key: moduleKey,
            usage: totalUsed,
            limit: limit,
            reset_date: billingCycle.end.toISOString(),
            action: 'usage_limit_reached'
          }
        }).catch(err => console.error('[checkUsageLimits] Failed to create notification:', err));
      }
      
      // Log audit
      await AuditLog.create({
        business_id: businessId,
        user_id: req.user?.id,
        action: `${moduleKey}.usage_limit_reached`,
        resource_type: 'subscription',
        resource_id: subscription.id,
        metadata: {
          module_key: moduleKey,
          usage: totalUsed,
          limit: limit,
          reset_date: billingCycle.end.toISOString()
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      }).catch(err => console.error('[checkUsageLimits] Failed to log audit:', err));
      
      return res.status(403).json({
        error: 'Usage limit reached',
        code: 'USAGE_LIMIT_REACHED',
        module_key: moduleKey,
        usage: {
          used: totalUsed,
          limit: limit,
          remaining: 0,
          percent_used: percentUsed,
          reset_date: billingCycle.end.toISOString()
        },
        message: `You've reached your usage limit (${totalUsed}/${limit}). Your limit resets on ${billingCycle.end.toLocaleDateString()}. Upgrade your plan to continue.`
      });
    }
    
    // Check if threshold reached (80%)
    if (percentUsed >= 80 && percentUsed < 100) {
      // Check if warning notification already sent
      const recentNotifications = await Notification.findByBusinessId(businessId);
      const hasRecentWarning = recentNotifications.some(n =>
        n.type === 'limit' &&
        n.metadata?.module_key === moduleKey &&
        n.metadata?.action === 'usage_warning' &&
        new Date(n.created_at) > new Date(Date.now() - 86400000) // Last 24 hours
      );
      
      if (!hasRecentWarning) {
        await Notification.create({
          business_id: businessId,
          user_id: null,
          type: 'limit',
          message: `You've used ${Math.round(percentUsed)}% of your ${moduleKey} usage limit (${totalUsed}/${limit}). Limit resets on ${billingCycle.end.toLocaleDateString()}.`,
          metadata: {
            module_key: moduleKey,
            usage: totalUsed,
            limit: limit,
            percent_used: percentUsed,
            reset_date: billingCycle.end.toISOString(),
            action: 'usage_warning'
          }
        }).catch(err => console.error('[checkUsageLimits] Failed to create notification:', err));
      }
    }
    
    // Attach usage status to request
    req.usage_status = {
      used: totalUsed,
      limit: limit,
      remaining: remaining,
      percent_used: percentUsed,
      reset_date: billingCycle.end.toISOString()
    };
    
    next();
  } catch (error) {
    console.error('[checkUsageLimits] Error:', error);
    // Allow request if check fails (fail open, but log error)
    return next();
  }
};


