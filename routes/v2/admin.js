import express from 'express';
import { authenticateAdmin } from '../../middleware/adminAuth.js';
import { AuditLog } from '../../models/v2/AuditLog.js';
import { Notification } from '../../models/v2/Notification.js';
import { Module } from '../../models/v2/Module.js';
import { Business } from '../../models/Business.js';
import { User } from '../../models/User.js';
import { OrganizationUser } from '../../models/v2/OrganizationUser.js';
import { AdminActivityLog } from '../../models/AdminActivityLog.js';
import { applyImpersonation } from '../../middleware/v2/applyImpersonation.js';
import { supabaseClient } from '../../config/database.js';

const router = express.Router();

// All admin routes require admin authentication
router.use(authenticateAdmin);

/**
 * GET /api/v2/admin/audit
 * Get audit logs with filtering
 */
router.get('/audit', async (req, res) => {
  try {
    const { business_id, user_id, action, resource_type, limit = 100, offset = 0 } = req.query;

    const logs = await AuditLog.find({
      business_id,
      user_id,
      action,
      resource_type,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      logs: logs.records || [],
      total: logs.total || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('[GET /api/v2/admin/audit] Error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * GET /api/v2/admin/notifications
 * Get all notifications (admin view)
 */
router.get('/notifications', async (req, res) => {
  try {
    const { business_id, type, unread_only, limit = 100, offset = 0 } = req.query;

    const notifications = await Notification.find({
      business_id,
      type,
      unread_only: unread_only === 'true',
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      notifications: notifications.records || [],
      total: notifications.total || 0,
    });
  } catch (error) {
    console.error('[GET /api/v2/admin/notifications] Error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * POST /api/v2/admin/notifications
 * Create a notification for a business/user
 */
router.post('/notifications', async (req, res) => {
  try {
    const { business_id, user_id, type, message, metadata } = req.body;

    if (!business_id || !type || !message) {
      return res.status(400).json({ error: 'business_id, type, and message are required' });
    }

    const notification = await Notification.create({
      business_id,
      user_id,
      type,
      message,
      metadata: metadata || {},
    });

    // Log admin activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id,
      action: 'create_notification',
      details: { type, message, notification_id: notification.id },
    });

    res.json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error('[POST /api/v2/admin/notifications] Error:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

/**
 * GET /api/v2/admin/modules
 * Get all modules (admin management view - includes inactive)
 */
router.get('/modules', async (req, res) => {
  try {
    const modules = await Module.findAll(true); // Include inactive modules for admin
    
    res.json({
      modules: modules || [],
    });
  } catch (error) {
    console.error('[GET /api/v2/admin/modules] Error:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

/**
 * PUT /api/v2/admin/modules/:moduleKey
 * Update module (health status, pricing, etc.)
 */
router.put('/modules/:moduleKey', async (req, res) => {
  try {
    const { moduleKey } = req.params;
    const { health_status, is_active, pricing } = req.body;

    const updateData = {};
    if (health_status !== undefined) updateData.health_status = health_status;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (pricing !== undefined) updateData.pricing = pricing;

    // Module.update supports both key and ID lookups
    const updated = await Module.update(moduleKey, updateData);

    // Log admin activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: 'update_module',
      details: { module_key: moduleKey, updates: updateData },
    });

    res.json({
      success: true,
      module: updated,
    });
  } catch (error) {
    console.error('[PUT /api/v2/admin/modules/:moduleKey] Error:', error);
    res.status(500).json({ error: 'Failed to update module' });
  }
});

/**
 * GET /api/v2/admin/pricing
 * Get pricing configuration for all modules
 */
router.get('/pricing', async (req, res) => {
  try {
    const modules = await Module.findAll(true); // Include inactive for admin view
    
    const pricing = modules.map(module => ({
      module_key: module.key,
      module_name: module.name,
      pricing: module.pricing || {},
      is_active: module.is_active,
      health_status: module.health_status,
    }));

    res.json({
      pricing,
    });
  } catch (error) {
    console.error('[GET /api/v2/admin/pricing] Error:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

/**
 * PUT /api/v2/admin/pricing/:moduleKey
 * Update module pricing
 */
router.put('/pricing/:moduleKey', async (req, res) => {
  try {
    const { moduleKey } = req.params;
    const { pricing } = req.body;

    if (!pricing || typeof pricing !== 'object') {
      return res.status(400).json({ error: 'Pricing object is required' });
    }

    // Module.update supports key lookup directly
    const updated = await Module.update(moduleKey, { pricing });
    
    if (!updated) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Log admin activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: 'update_pricing',
      details: { module_key: moduleKey, pricing },
    });

    res.json({
      success: true,
      module: updated,
    });
  } catch (error) {
    console.error('[PUT /api/v2/admin/pricing/:moduleKey] Error:', error);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

/**
 * GET /api/v2/admin/support/impersonate/:userId
 * Get impersonation token for a user (admin only)
 */
router.get('/support/impersonate/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's organizations
    const orgUsers = await OrganizationUser.findByUserId(userId);
    
    // Log impersonation start
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: 'start_impersonation',
      details: {
        target_user_id: userId,
        target_user_email: user.email,
        organizations: orgUsers.map(ou => ({ id: ou.business_id, role: ou.role })),
      },
    });

    // Create impersonation token (in a real implementation, this would be a special token)
    // For now, we'll return the user info and admin can use applyImpersonation middleware
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
      organizations: orgUsers.map(ou => ({
        id: ou.business_id,
        role: ou.role,
      })),
      message: 'Use X-Impersonate-User-Id header with this user ID to impersonate',
    });
  } catch (error) {
    console.error('[GET /api/v2/admin/support/impersonate/:userId] Error:', error);
    res.status(500).json({ error: 'Failed to prepare impersonation' });
  }
});

/**
 * POST /api/v2/admin/support/end-impersonation
 * End impersonation session
 */
router.post('/support/end-impersonation', async (req, res) => {
  try {
    const { user_id, business_id } = req.body;

    // Log impersonation end
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id,
      action: 'end_impersonation',
      details: {
        target_user_id: user_id,
      },
    });

    res.json({
      success: true,
      message: 'Impersonation ended',
    });
  } catch (error) {
    console.error('[POST /api/v2/admin/support/end-impersonation] Error:', error);
    res.status(500).json({ error: 'Failed to end impersonation' });
  }
});

/**
 * GET /api/v2/admin/support/businesses
 * Search businesses for support purposes
 */
router.get('/support/businesses', async (req, res) => {
  try {
    const { search, limit = 50 } = req.query;
    const { supabaseClient } = await import('../../config/database.js');
    
    let query = supabaseClient
      .from('businesses')
      .select('*')
      .is('deleted_at', null)
      .limit(parseInt(limit));

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      businesses: data || [],
    });
  } catch (error) {
    console.error('[GET /api/v2/admin/support/businesses] Error:', error);
    res.status(500).json({ error: 'Failed to search businesses' });
  }
});

/**
 * GET /api/v2/admin/support/businesses/:businessId/users
 * Get all users for a business
 */
router.get('/support/businesses/:businessId/users', async (req, res) => {
  try {
    const { businessId } = req.params;
    
    const orgUsers = await OrganizationUser.findByBusinessId(businessId);
    
    const users = await Promise.all(
      orgUsers.map(async (orgUser) => {
        const user = await User.findById(orgUser.user_id);
        return {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: orgUser.role,
          created_at: orgUser.created_at,
        };
      })
    );

    res.json({
      users: users || [],
    });
  } catch (error) {
    console.error('[GET /api/v2/admin/support/businesses/:businessId/users] Error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * PUT /api/v2/admin/modules/:moduleKey/health
 * Set module health status (admin only)
 */
router.put('/modules/:moduleKey/health', async (req, res) => {
  try {
    const { moduleKey } = req.params;
    const { health_status } = req.body;
    
    if (!['healthy', 'degraded', 'offline'].includes(health_status)) {
      return res.status(400).json({ error: 'Invalid health_status' });
    }
    
    const module = await Module.updateHealthStatus(moduleKey, health_status);
    
    // Log admin activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: 'module_health_updated',
      details: {
        module_key: moduleKey,
        health_status: health_status,
        module_id: module.id
      }
    });
    
    res.json({
      success: true,
      module: {
        key: module.key,
        name: module.name,
        health_status: module.health_status
      }
    });
  } catch (error) {
    console.error('[PUT /api/v2/admin/modules/:moduleKey/health] Error:', error);
    res.status(500).json({ error: 'Failed to update module health' });
  }
});

/**
 * GET /api/v2/admin/modules/:moduleKey/stats
 * Get usage statistics for a module across all businesses (admin only)
 */
router.get('/modules/:moduleKey/stats', async (req, res) => {
  try {
    const { moduleKey } = req.params;
    const { start_date, end_date } = req.query;
    
    let query = supabaseClient
      .from('usage_logs')
      .select('business_id, units_used, created_at', { count: 'exact' })
      .eq('module_key', moduleKey);
    
    if (start_date) {
      query = query.gte('created_at', start_date);
    }
    if (end_date) {
      query = query.lte('created_at', end_date);
    }
    
    const { data: logs, error, count } = await query;
    
    if (error) throw error;
    
    // Aggregate stats
    const totalUsage = (logs || []).reduce((sum, log) => sum + parseFloat(log.units_used || 0), 0);
    const uniqueBusinesses = new Set((logs || []).map(log => log.business_id)).size;
    
    res.json({
      module_key: moduleKey,
      total_usage: totalUsage,
      total_generations: count || 0,
      unique_businesses: uniqueBusinesses,
      period: {
        start: start_date || 'all_time',
        end: end_date || 'all_time'
      }
    });
  } catch (error) {
    console.error('[GET /api/v2/admin/modules/:moduleKey/stats] Error:', error);
    res.status(500).json({ error: 'Failed to fetch module stats' });
  }
});

/**
 * GET /api/v2/admin/modules/:moduleKey/outputs
 * Get all generated outputs for a module (admin view, for support/debugging)
 */
router.get('/modules/:moduleKey/outputs', async (req, res) => {
  try {
    const { moduleKey } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    // Only for reviews module for now
    if (moduleKey === 'reviews') {
      const { data: outputs, error, count } = await supabaseClient
        .from('reviews_outputs')
        .select('*', { count: 'exact' })
        .eq('module_key', moduleKey)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      
      res.json({
        outputs: outputs || [],
        total: count || 0,
        limit,
        offset
      });
    } else {
      res.status(400).json({ error: 'Module outputs endpoint not implemented for this module' });
    }
  } catch (error) {
    console.error('[GET /api/v2/admin/modules/:moduleKey/outputs] Error:', error);
    res.status(500).json({ error: 'Failed to fetch outputs' });
  }
});

export default router;

