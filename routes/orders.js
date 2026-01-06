// routes/orders.js
// API routes for takeout order management

import express from 'express';
import { TakeoutOrder } from '../models/TakeoutOrder.js';

const router = express.Router();

// Import authentication middleware
import { authenticate } from '../middleware/auth.js';

/**
 * Create a new takeout order
 * POST /api/orders
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      call_session_id,
      vapi_call_id,
      customer_name,
      customer_phone,
      customer_email,
      order_type = 'takeout',
      status = 'pending',
      special_instructions,
      subtotal = 0,
      tax = 0,
      total = 0,
      items = [],
    } = req.body;
    
    // Validate required fields
    if (!customer_phone) {
      return res.status(400).json({ error: 'Customer phone number is required' });
    }
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must have at least one item' });
    }
    
    // Create the order
    const order = await TakeoutOrder.create({
      business_id: req.businessId,
      call_session_id,
      vapi_call_id,
      customer_name,
      customer_phone,
      customer_email,
      order_type,
      status,
      special_instructions,
      subtotal,
      tax,
      total,
      items,
    });
    
    console.log(`[Orders API] ✅ Order created: ${order.order_number} (${order.id})`);
    
    res.status(201).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[Orders API] Error creating order:', error);
    res.status(500).json({ error: error.message || 'Failed to create order' });
  }
});

/**
 * Get orders for a business
 * GET /api/orders
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      status,
      limit = 100,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'desc',
    } = req.query;
    
    const orders = await TakeoutOrder.findByBusinessId(req.businessId, {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset),
      orderBy,
      orderDirection,
    });
    
    res.json({
      success: true,
      orders,
      count: orders.length,
    });
  } catch (error) {
    console.error('[Orders API] Error fetching orders:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch orders' });
  }
});

/**
 * Get active orders for kitchen display
 * GET /api/orders/active
 */
router.get('/active', authenticate, async (req, res) => {
  try {
    const orders = await TakeoutOrder.getActiveOrders(req.businessId);
    
    res.json({
      success: true,
      orders,
      count: orders.length,
    });
  } catch (error) {
    console.error('[Orders API] Error fetching active orders:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch active orders' });
  }
});

/**
 * Get order by ID
 * GET /api/orders/:orderId
 */
router.get('/:orderId', authenticate, async (req, res) => {
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
    console.error('[Orders API] Error fetching order:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch order' });
  }
});

/**
 * Update order status
 * PATCH /api/orders/:orderId/status
 */
router.patch('/:orderId/status', authenticate, async (req, res) => {
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
    
    console.log(`[Orders API] ✅ Order status updated: ${order.order_number} -> ${status}`);
    
    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[Orders API] Error updating order status:', error);
    res.status(500).json({ error: error.message || 'Failed to update order status' });
  }
});

export default router;

