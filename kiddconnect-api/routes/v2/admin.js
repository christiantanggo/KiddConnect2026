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
import { getDeliveryConfig, getDeliveryConfigFull, updateDeliveryConfig, normalizePhone } from '../../services/delivery-network/config.js';
import { createDeliveryNetworkAssistant } from '../../services/delivery-network/create-vapi-assistant.js';
import { linkDeliveryAssistantToNumbers } from '../../services/delivery-network/linkAgent.js';
import { getTavariOwnedPhoneNumbers } from '../../utils/tavariPhoneNumbers.js';

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

// ---------- Delivery operator (admin-only): escalated deliveries, retry, cancel, override ----------
/**
 * GET /api/v2/admin/delivery-operator/requests
 * List delivery requests for operator (escalated first, then recent). Query: status, limit.
 */
router.get('/delivery-operator/requests', async (req, res) => {
  try {
    const status = req.query.status; // e.g. Needs Manual Assist
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);
    const colsBase = 'id, reference_number, business_id, callback_phone, delivery_address, recipient_name, priority, status, payment_status, amount_quoted_cents, quoted_on_demand_provider, created_at, updated_at, pickup_address, caller_phone, scheduled_date, scheduled_time';
    const colsWithPod = `${colsBase}, pod_captured_at, pod_signature_url`;
    const runListQuery = async (cols) => {
      let q = supabaseClient
        .from('delivery_requests')
        .select(`${cols}, businesses(name)`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (status) q = q.eq('status', status);
      return q;
    };
    let effectiveCols = colsWithPod;
    let { data, error } = await runListQuery(colsWithPod);
    if (error && /pod_captured_at|pod_signature|column .* does not exist/i.test(String(error.message || ''))) {
      console.warn('[Admin delivery-operator] POD columns missing — run migrations/add_delivery_proof_of_delivery.sql; listing without POD fields.');
      effectiveCols = colsBase;
      const retry = await runListQuery(colsBase);
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      // Fallback if relation "businesses" not available: fetch requests then look up names
      let q = supabaseClient.from('delivery_requests').select(effectiveCols).order('created_at', { ascending: false }).limit(limit);
      if (status) q = q.eq('status', status);
      const res2 = await q;
      if (res2.error) throw res2.error;
      data = res2.data || [];
      const ids = [...new Set(data.map((r) => r.business_id).filter(Boolean))];
      let names = {};
      if (ids.length > 0) {
        const { data: biz } = await supabaseClient.from('businesses').select('id, name').in('id', ids);
        if (biz) biz.forEach((b) => { names[b.id] = b.name; });
      }
      data = data.map((r) => ({ ...r, business_name: r.business_id ? names[r.business_id] ?? null : null }));
    } else {
      data = (data || []).map((r) => {
        const { businesses, ...rest } = r;
        return { ...rest, business_name: businesses?.name ?? null };
      });
    }
    res.json({ requests: data });
  } catch (err) {
    console.error('[Admin delivery-operator] list error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load requests' });
  }
});

/**
 * GET /api/v2/admin/delivery-operator/requests/:id
 * Fetch a single delivery request for viewing/editing (includes business name).
 */
router.get('/delivery-operator/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseClient
      .from('delivery_requests')
      .select('*, businesses(name)')
      .eq('id', id)
      .single();
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    const { businesses, ...request } = data || {};
    res.json({ ...request, business_name: businesses?.name ?? null });
  } catch (err) {
    console.error('[Admin delivery-operator] get request error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load request' });
  }
});

/**
 * POST /api/v2/admin/delivery-operator/requests
 * Admin creates a delivery request on behalf of a business (manual/back-office).
 */
router.post('/delivery-operator/requests', express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const business_id = body.business_id || null;
    if (!business_id || typeof business_id !== 'string' || !business_id.trim()) {
      return res.status(400).json({ error: 'Business is required.' });
    }
    const callback_phone = body.callback_phone || body.phone || '';
    if (!callback_phone || !String(callback_phone).trim()) {
      return res.status(400).json({ error: 'Contact phone is required.' });
    }
    const delivery_address = body.delivery_address || body.address || '';
    const delivery_city = body.delivery_city?.trim() || null;
    const delivery_province = body.delivery_province?.trim() || null;
    const delivery_postal_code = body.delivery_postal_code?.trim() || null;
    if (!delivery_address || !String(delivery_address).trim()) {
      return res.status(400).json({ error: 'Delivery address (street) is required.' });
    }
    if (!delivery_city || !delivery_province || !delivery_postal_code) {
      return res.status(400).json({ error: 'Delivery city, province, and postal code are required.' });
    }
    const { createDeliveryRequest } = await import('../../services/delivery-network/intake.js');
    const { startDispatch } = await import('../../services/delivery-network/dispatch.js');
    const request = await createDeliveryRequest({
      business_id: business_id.trim(),
      callback_phone: String(callback_phone).trim(),
      pickup_address: body.pickup_address?.trim() || null,
      pickup_city: body.pickup_city?.trim() || null,
      pickup_province: body.pickup_province?.trim() || null,
      pickup_postal_code: body.pickup_postal_code?.trim() || null,
      delivery_address: String(delivery_address).trim(),
      delivery_city,
      delivery_province,
      delivery_postal_code,
      recipient_name: body.recipient_name?.trim() || null,
      recipient_phone: body.recipient_phone?.trim() || null,
      package_description: body.package_description?.trim() || null,
      special_instructions: body.special_instructions?.trim() || null,
      priority: body.priority === 'Immediate' || body.priority === 'Same Day' ? body.priority : 'Schedule',
      scheduled_date: body.scheduled_date?.trim() || null,
      scheduled_time: body.scheduled_time?.trim() || null,
      intake_channel: 'admin',
      amount_quoted_cents: body.amount_quoted_cents != null && Number.isFinite(Number(body.amount_quoted_cents)) ? Math.round(Number(body.amount_quoted_cents)) : null,
      quoted_on_demand_provider: body.quoted_on_demand_provider != null && String(body.quoted_on_demand_provider).trim() ? String(body.quoted_on_demand_provider).trim() : null,
    });
    startDispatch(request.id).catch((err) =>
      console.error('[Admin delivery-operator] startDispatch after create error:', err?.message || err)
    );
    res.status(201).json({
      success: true,
      message: 'Delivery created. Dispatch has been started.',
      request_id: request.id,
      reference_number: request.reference_number,
    });
  } catch (err) {
    console.error('[Admin delivery-operator] create request error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to create delivery request.' });
  }
});

/**
 * POST /api/v2/admin/delivery-operator/requests/:id/retry-dispatch
 * Retry broker dispatch for a request (admin only).
 */
router.post('/delivery-operator/requests/:id/retry-dispatch', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDispatch } = await import('../../services/delivery-network/dispatch.js');
    await startDispatch(id);
    res.json({ success: true, message: 'Dispatch retry started' });
  } catch (err) {
    console.error('[Admin delivery-operator] retry error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Retry failed' });
  }
});

/**
 * POST /api/v2/admin/delivery-operator/requests/:id/sync-pod
 * Pull proof of delivery (signature + photos) from Shipday into Tavari.
 */
router.post('/delivery-operator/requests/:id/sync-pod', async (req, res) => {
  try {
    const { id } = req.params;
    const { syncProofOfDeliveryFromShipday } = await import('../../services/delivery-network/shipdayPod.js');
    const result = await syncProofOfDeliveryFromShipday(id);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Sync failed' });
    }
    const { data: row } = await supabaseClient
      .from('delivery_requests')
      .select('pod_signature_url, pod_photo_urls, pod_latitude, pod_longitude, pod_captured_at, pod_source')
      .eq('id', id)
      .single();
    res.json({ success: true, updated: result.updated, proof: result.proof, stored: row || null });
  } catch (err) {
    console.error('[Admin delivery-operator] sync-pod error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Sync failed' });
  }
});

/**
 * PATCH /api/v2/admin/delivery-operator/requests/:id
 * Operator edit: status, amount_quoted_cents, address fields, recipient, package, priority, scheduled date/time.
 */
router.patch('/delivery-operator/requests/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const updates = { updated_at: new Date().toISOString() };
    const allowedStatuses = [
      'New',
      'Contacting',
      'ChoosingCarrier',
      'Dispatched',
      'Assigned',
      'PickedUp',
      'Completed',
      'Failed',
      'Cancelled',
      'Needs Manual Assist',
    ];
    if (body.status && allowedStatuses.includes(body.status)) updates.status = body.status;
    if (body.amount_quoted_cents !== undefined && Number.isFinite(body.amount_quoted_cents)) updates.amount_quoted_cents = Math.max(0, Math.round(body.amount_quoted_cents));
    const stringFields = [
      'callback_phone', 'recipient_name', 'recipient_phone', 'delivery_address', 'delivery_city', 'delivery_province', 'delivery_postal_code',
      'pickup_address', 'pickup_city', 'pickup_province', 'pickup_postal_code', 'package_description', 'special_instructions',
      'scheduled_date', 'scheduled_time', 'quoted_on_demand_provider',
    ];
    for (const key of stringFields) {
      if (body[key] !== undefined) updates[key] = body[key] === null || body[key] === '' ? null : String(body[key]).trim();
    }
    if (body.priority === 'Immediate' || body.priority === 'Same Day' || body.priority === 'Schedule') updates.priority = body.priority;
    if (Object.keys(updates).length <= 1) return res.status(400).json({ error: 'No valid updates' });
    const { data, error } = await supabaseClient.from('delivery_requests').update(updates).eq('id', id).select().single();
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    // Sync to Shipday when date/time or other Shipday-relevant fields change so Shipday shows the same data.
    const syncRelevant = ['scheduled_date', 'scheduled_time', 'priority', 'delivery_address', 'delivery_city', 'delivery_province', 'delivery_postal_code', 'pickup_address', 'pickup_city', 'pickup_province', 'pickup_postal_code', 'recipient_name', 'callback_phone', 'special_instructions', 'package_description'].some((k) => updates[k] !== undefined);
    if (syncRelevant && data) {
      const { syncDeliveryRequestToShipday } = await import('../../services/delivery-network/shipdayEdit.js');
      syncDeliveryRequestToShipday(id, data).then((r) => {
        if (!r.success) console.warn('[Admin delivery-operator] Shipday sync after PATCH:', r.error);
      }).catch((e) => console.warn('[Admin delivery-operator] Shipday sync error:', e?.message || e));
    }
    res.json(data);
  } catch (err) {
    console.error('[Admin delivery-operator] patch error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Update failed' });
  }
});

// ---------- Delivery operator: global config (admin-only) ----------

/**
 * GET /api/v2/admin/delivery-operator/phone-numbers
 * List Tavari-owned phone numbers for delivery line assignment (admin Settings).
 */
router.get('/delivery-operator/phone-numbers', async (req, res) => {
  try {
    const numbers = await getTavariOwnedPhoneNumbers();
    res.json({ phone_numbers: numbers });
  } catch (err) {
    console.error('[Admin delivery-operator] phone-numbers error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load numbers', phone_numbers: [] });
  }
});

/**
 * GET /api/v2/admin/delivery-operator/carriers
 * List Shipday carriers (drivers/companies). Use IDs in Preferred carrier IDs to assign orders and get delivery cost.
 */
router.get('/delivery-operator/carriers', async (req, res) => {
  try {
    const { getShipdayCredentials } = await import('../../services/delivery-network/shipdayQuote.js');
    const { apiKey, baseUrl } = await getShipdayCredentials();
    if (!apiKey) return res.status(400).json({ error: 'Shipday not configured', carriers: [] });
    const axios = (await import('axios')).default;
    const r = await axios.get(`${baseUrl.replace(/\/$/, '')}/carriers`, {
      headers: { Accept: 'application/json', Authorization: `Basic ${apiKey}` },
      timeout: 10000,
      validateStatus: (s) => s < 500,
    });
    if (r.status !== 200) return res.status(r.status).json({ error: 'Shipday carriers request failed', carriers: [] });
    const list = Array.isArray(r.data) ? r.data : [];
    res.json({ carriers: list.map((c) => ({ id: c.id, name: c.name, companyId: c.companyId, isActive: c.isActive, isOnShift: c.isOnShift })) });
  } catch (err) {
    console.error('[Admin delivery-operator] carriers error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load carriers', carriers: [] });
  }
});

/**
 * GET /api/v2/admin/delivery-operator/quote
 * Estimated cost for a delivery. Query: business_id (optional), pickup_address, delivery_address (optional),
 * customer_phone, recipient_name. When pickup_address and delivery_address are provided and Shipday is
 * configured, we try to get a quote from Shipday (create scheduled order → get costing → delete order).
 * Otherwise uses configured rates (Settings → Billing).
 */
function buildFullPickupFromParts(street, city, province, postalCode) {
  const s = street && String(street).trim();
  const c = city && String(city).trim();
  const p = province && String(province).trim();
  const z = postalCode && String(postalCode).trim();
  if (s && (c || p || z)) {
    const rest = [c, [p, z].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return rest ? `${s}, ${rest}` : s;
  }
  return s || null;
}

router.get('/delivery-operator/quote', async (req, res) => {
  try {
    const businessId = (req.query.business_id && String(req.query.business_id).trim()) || null;
    const pickup_street = (req.query.pickup_address && String(req.query.pickup_address).trim()) || null;
    const pickup_city = (req.query.pickup_city && String(req.query.pickup_city).trim()) || null;
    const pickup_province = (req.query.pickup_province && String(req.query.pickup_province).trim()) || null;
    const pickup_postal_code = (req.query.pickup_postal_code && String(req.query.pickup_postal_code).trim()) || null;
    const pickup_address = buildFullPickupFromParts(pickup_street, pickup_city, pickup_province, pickup_postal_code) || pickup_street;
    const delivery_street = (req.query.delivery_address && String(req.query.delivery_address).trim()) || null;
    const delivery_city_q = (req.query.delivery_city && String(req.query.delivery_city).trim()) || null;
    const delivery_province_q = (req.query.delivery_province && String(req.query.delivery_province).trim()) || null;
    const delivery_postal_code_q = (req.query.delivery_postal_code && String(req.query.delivery_postal_code).trim()) || null;
    const delivery_address = buildFullPickupFromParts(delivery_street, delivery_city_q, delivery_province_q, delivery_postal_code_q) || delivery_street;
    const pickup_phone = (req.query.pickup_phone && String(req.query.pickup_phone).trim()) || null;
    const pickup_name = (req.query.pickup_name && String(req.query.pickup_name).trim()) || null;
    const customer_phone = (req.query.customer_phone && String(req.query.customer_phone).trim()) || null;
    const recipient_name = (req.query.recipient_name && String(req.query.recipient_name).trim()) || null;
    const customer_email = (req.query.customer_email && String(req.query.customer_email).trim()) || null;

    if (pickup_address && delivery_address) {
      console.log('[Admin delivery-operator] Quote: requesting delivery cost from Shipday (pickup + delivery addresses provided)');
      const { getQuoteFromShipday } = await import('../../services/delivery-network/shipdayQuote.js');
      const shipdayQuote = await getQuoteFromShipday({
        pickup_address,
        delivery_address,
        pickup_phone,
        pickup_name,
        customer_phone,
        recipient_name,
        customer_email,
      });
      if (shipdayQuote && shipdayQuote.cost_usd != null) {
        const { calculateDeliveryPrice } = await import('../../services/delivery-network/pricingEngine.js');
        const pricing = await calculateDeliveryPrice({
          cost_usd: shipdayQuote.cost_usd,
          business_id: businessId,
        });
        const out = {
          ...pricing,
          total_cents: pricing.amount_cents,
          source: shipdayQuote.source,
          provider_name: shipdayQuote.provider_name ?? undefined,
        };
        console.log('[Admin delivery-operator] Quote: pricing engine → final_price_cad=%s, amount_cents=%s', pricing.final_price_cad, pricing.amount_cents);
        return res.json(out);
      }
      console.log('[Admin delivery-operator] Quote: Shipday returned no quote; using configured rate');
    } else {
      const reason = !pickup_address && !delivery_address ? 'no pickup or delivery address'
        : !pickup_address ? 'no pickup address'
        : 'no delivery address';
      console.log('[Admin delivery-operator] Quote: using configured rate (%s). Fill both addresses and click Quote to get a Shipday estimate.', reason);
    }
    const { getQuote } = await import('../../services/delivery-network/pricing.js');
    const quote = await getQuote(businessId);
    const didTryShipday = !!(pickup_address && delivery_address);
    res.json({ ...quote, shipday_tried_no_cost: didTryShipday });
  } catch (err) {
    console.error('[Admin delivery-operator] quote error:', err?.message || err);
    res.status(500).json({ amount_cents: 2000, disclaimer: 'Final cost may vary.', currency: 'CAD' });
  }
});

/**
 * GET /api/v2/admin/delivery-operator/config
 * Full global delivery config for admin Settings.
 */
router.get('/delivery-operator/config', async (req, res) => {
  try {
    const config = await getDeliveryConfigFull();
    // Normalize so frontend selection compare/save is consistent (E.164 with +)
    if (Array.isArray(config.delivery_phone_numbers)) {
      config.delivery_phone_numbers = config.delivery_phone_numbers.map(normalizePhone).filter(Boolean);
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.json(config);
  } catch (err) {
    console.error('[Admin delivery-operator] config get error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load config' });
  }
});

/**
 * PUT /api/v2/admin/delivery-operator/config
 * Update global delivery config (line numbers, assistant id, notifications, billing, etc.).
 */
router.put('/delivery-operator/config', express.json(), async (req, res) => {
  try {
    const updated = await updateDeliveryConfig(req.body || {});
    res.json(updated);
  } catch (err) {
    console.error('[Admin delivery-operator] config put error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to update config' });
  }
});

/**
 * POST /api/v2/admin/delivery-operator/test-broker-connection
 * Test API credentials for a delivery broker (e.g. Shipday) without saving.
 * Body: { broker_id, api_key, base_url? }
 */
router.post('/delivery-operator/test-broker-connection', express.json(), async (req, res) => {
  try {
    const { broker_id, api_key, base_url } = req.body || {};
    if (!broker_id || !api_key || typeof api_key !== 'string' || !api_key.trim()) {
      return res.status(400).json({ success: false, error: 'Broker and API key are required.' });
    }
    const key = api_key.trim();
    const baseUrl = (base_url && typeof base_url === 'string' && base_url.trim())
      ? base_url.trim().replace(/\/$/, '')
      : 'https://api.shipday.com';

    if (broker_id === 'shipday') {
      const axios = (await import('axios')).default;
      const url = `${baseUrl}/orders`;
      console.log('[Admin delivery-operator] Shipday test: calling GET', url, '(limit=1)');
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Basic ${key}`,
        },
        params: { limit: 1 },
        timeout: 15000,
        validateStatus: () => true,
      });
      const data = response.data;
      const count = data?.content?.length ?? (Array.isArray(data) ? data.length : data?.numberOfElements);
      const bodySummary = typeof count === 'number'
        ? `${count} order(s)`
        : (data && typeof data === 'object' ? `keys: ${Object.keys(data).slice(0, 8).join(', ')}` : typeof data);
      console.log('[Admin delivery-operator] Shipday test: response status=', response.status, 'body=', bodySummary);
      if (response.status === 200) {
        const responseSummary = typeof count === 'number'
          ? `${count} order(s) in response`
          : (data && typeof data === 'object' ? `Response keys: ${Object.keys(data).slice(0, 8).join(', ')}` : 'OK');
        return res.json({
          success: true,
          message: 'Connection successful.',
          detail: `Request: GET ${baseUrl}/orders?limit=1 (with your API key). Response: HTTP 200. Body: ${responseSummary}.`,
          request_url: `${baseUrl}/orders`,
          response_status: 200,
          response_summary: responseSummary,
        });
      }
      if (response.status === 401 || response.status === 403) {
        console.log('[Admin delivery-operator] Shipday test: auth failed', response.status);
        return res.json({ success: false, error: 'Invalid API key or access denied.' });
      }
      const msg = response.data?.message || response.data?.error || response.statusText || `HTTP ${response.status}`;
      console.log('[Admin delivery-operator] Shipday test: failed', response.status, msg);
      return res.json({ success: false, error: msg });
    }

    return res.status(400).json({ success: false, error: `Unknown broker: ${broker_id}. Test is only supported for Shipday.` });
  } catch (err) {
    const message = err.response?.data?.message || err.response?.data?.error || err.message || 'Connection test failed.';
    console.error('[Admin delivery-operator] test-broker-connection error:', err?.message || err);
    if (err.response) {
      console.error('[Admin delivery-operator] Shipday test: request failed status=', err.response.status, 'data=', JSON.stringify(err.response.data)?.slice(0, 200));
    }
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/v2/admin/delivery-operator/create-agent
 * Create delivery VAPI assistant and save id to config; optionally link to current delivery numbers.
 */
router.post('/delivery-operator/create-agent', async (req, res) => {
  try {
    const assistant = await createDeliveryNetworkAssistant();
    const assistantId = assistant.id;
    await updateDeliveryConfig({ delivery_vapi_assistant_id: assistantId });
    const config = await getDeliveryConfig();
    const numbers = config.delivery_phone_numbers || [];
    let linkResult = { linked: [], notInVapi: [], errors: [] };
    if (numbers.length > 0) {
      linkResult = await linkDeliveryAssistantToNumbers(assistantId, numbers);
    }
    res.status(201).json({
      success: true,
      assistant_id: assistantId,
      assistant_name: assistant.name,
      link_result: linkResult,
    });
  } catch (err) {
    const status = err.response?.status;
    const vapiBody = err.response?.data;
    const msg = (vapiBody && typeof vapiBody === 'object' && vapiBody.message) ? vapiBody.message : err?.message || 'Failed to create agent';
    console.error('[Admin delivery-operator] create-agent error:', err?.message || err);
    res.status(status === 400 ? 400 : 500).json({ error: msg });
  }
});

/**
 * POST /api/v2/admin/delivery-operator/link-agent
 * Link current delivery assistant to configured delivery_phone_numbers in VAPI.
 */
router.post('/delivery-operator/link-agent', async (req, res) => {
  try {
    const config = await getDeliveryConfig();
    const assistantId = config.delivery_vapi_assistant_id || null;
    const numbers = config.delivery_phone_numbers || [];
    if (!assistantId) {
      return res.status(400).json({ error: 'No delivery assistant configured. Create an agent first.', linked: [], notInVapi: [], errors: [] });
    }
    if (numbers.length === 0) {
      return res.status(400).json({ error: 'No delivery phone numbers configured. Add at least one number in Settings.', linked: [], notInVapi: [], errors: [] });
    }
    const result = await linkDeliveryAssistantToNumbers(assistantId, numbers);
    res.json({
      success: result.errors.length === 0 && result.linked.length > 0,
      message: result.linked.length
        ? `Linked to ${result.linked.length} number(s).`
        : result.notInVapi.length
          ? `Could not provision: ${result.notInVapi.join(', ')}. Ensure numbers are in Telnyx and VAPI.`
          : result.errors.join('; '),
      linked: result.linked,
      notInVapi: result.notInVapi,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[Admin delivery-operator] link-agent error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to link agent', linked: [], notInVapi: [], errors: [] });
  }
});

export default router;

