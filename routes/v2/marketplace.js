import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { Module } from '../../models/v2/Module.js';
import { Subscription } from '../../models/v2/Subscription.js';

const router = express.Router();

// All marketplace routes require authentication and business context
router.use(authenticate);
router.use(requireBusinessContext);

/**
 * GET /api/v2/marketplace
 * Get available modules for purchase/subscription
 * Shows all active modules with subscription status for current business
 */
router.get('/', async (req, res) => {
  try {
    const modules = await Module.findAll();
    const subscriptions = await Subscription.findActiveByBusinessId(req.active_business_id);
    
    // Create subscription map
    const subscriptionMap = {};
    subscriptions.forEach(sub => {
      subscriptionMap[sub.module_key] = sub;
    });
    
    const marketplaceModules = modules.map(module => {
      const subscription = subscriptionMap[module.key];
      return {
        key: module.key,
        name: module.name,
        description: module.description,
        category: module.category,
        icon_url: module.icon_url,
        subscription_status: subscription?.status || null,
        subscription_plan: subscription?.plan || null,
        health_status: module.health_status,
        is_subscribed: !!subscription
      };
    });
    
    res.json({
      modules: marketplaceModules
    });
  } catch (error) {
    console.error('[GET /api/v2/marketplace] Error:', error);
    res.status(500).json({ error: 'Failed to fetch marketplace modules' });
  }
});

export default router;

