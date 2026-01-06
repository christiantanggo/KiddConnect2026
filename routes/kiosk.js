// routes/kiosk.js
// Kiosk API routes for kitchen display system
// These routes use kiosk token authentication (no user login required)

import express from 'express';
import { TakeoutOrder } from '../models/TakeoutOrder.js';
import { authenticateKiosk } from '../middleware/kioskAuth.js';
import { Business } from '../models/Business.js';

const router = express.Router();

// All kiosk routes require kiosk token authentication
router.use(authenticateKiosk);

/**
 * Get active orders for kitchen display
 * GET /api/kiosk/orders/active
 */
router.get('/orders/active', async (req, res) => {
  try {
    const orders = await TakeoutOrder.getActiveOrders(req.businessId);
    
    res.json({
      success: true,
      orders,
      count: orders.length,
    });
  } catch (error) {
    console.error('[Kiosk API] Error fetching active orders:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch active orders' });
  }
});

/**
 * Get order history
 * GET /api/kiosk/orders/history
 */
router.get('/orders/history', async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      status,
    } = req.query;
    
    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      orderBy: 'created_at',
      orderDirection: 'desc',
    };
    
    if (status) {
      options.status = status;
    }
    
    const orders = await TakeoutOrder.findByBusinessId(req.businessId, options);
    
    res.json({
      success: true,
      orders,
      count: orders.length,
    });
  } catch (error) {
    console.error('[Kiosk API] Error fetching order history:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch order history' });
  }
});

/**
 * Get single order by ID
 * GET /api/kiosk/orders/:orderId
 */
router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await TakeoutOrder.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Verify order belongs to business
    if (order.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[Kiosk API] Error fetching order:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch order' });
  }
});

/**
 * Update order status
 * PATCH /api/kiosk/orders/:orderId/status
 */
router.patch('/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, estimated_ready_time } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    // Validate status
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    
    // Verify order exists and belongs to business
    const existingOrder = await TakeoutOrder.findById(orderId);
    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (existingOrder.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update status
    const order = await TakeoutOrder.updateStatus(orderId, status, {
      estimated_ready_time,
    });
    
    console.log(`[Kiosk API] ✅ Order status updated: ${order.order_number} -> ${status}`);
    
    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[Kiosk API] Error updating order status:', error);
    res.status(500).json({ error: error.message || 'Failed to update order status' });
  }
});

/**
 * Get receipt data for printing
 * GET /api/kiosk/orders/:orderId/receipt
 */
router.get('/orders/:orderId/receipt', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await TakeoutOrder.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Verify order belongs to business
    if (order.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get business info for receipt header
    const business = await Business.findById(req.businessId);
    
    res.json({
      success: true,
      receipt: {
        business: {
          name: business.name,
          address: business.address,
          phone: business.public_phone_number,
        },
        order: {
          order_number: order.order_number,
          created_at: order.created_at,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          items: order.items || [],
          subtotal: order.subtotal,
          tax: order.tax,
          total: order.total,
          special_instructions: order.special_instructions,
        },
      },
    });
  } catch (error) {
    console.error('[Kiosk API] Error fetching receipt:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch receipt' });
  }
});

/**
 * Get business settings (for countdown timer, etc.)
 * GET /api/kiosk/settings
 */
router.get('/settings', async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    
    res.json({
      success: true,
      settings: {
        business_name: business.name,
        business_address: business.address,
        business_phone: business.public_phone_number,
        takeout_estimated_ready_minutes: business.takeout_estimated_ready_minutes || 30,
        takeout_tax_rate: business.takeout_tax_rate,
        takeout_tax_calculation_method: business.takeout_tax_calculation_method,
        timezone: business.timezone || 'America/New_York',
      },
    });
  } catch (error) {
    console.error('[Kiosk API] Error fetching settings:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch settings' });
  }
});

export default router;

