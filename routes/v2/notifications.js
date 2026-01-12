import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { Notification } from '../../models/v2/Notification.js';
import { OrganizationUser } from '../../models/v2/OrganizationUser.js';

const router = express.Router();

// All notification routes require authentication and business context
router.use(authenticate);
router.use(requireBusinessContext);

/**
 * GET /api/v2/notifications
 * Get notifications for current business/user
 */
router.get('/', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const userId = req.user.id;
    
    // Get all notifications for the business (if user has access)
    const notifications = await Notification.findByBusinessId(businessId);
    
    // Filter by user if user_id is set, otherwise show all business notifications
    // Users in the organization can see all business notifications
    const filteredNotifications = notifications.filter(n => 
      !n.user_id || n.user_id === userId || n.business_id === businessId
    );
    
    res.json({
      notifications: filteredNotifications,
      count: filteredNotifications.length,
    });
  } catch (error) {
    console.error('[GET /api/v2/notifications] Error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * GET /api/v2/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const userId = req.user.id;
    
    // Get unread count for business (all users can see business notifications)
    const unreadCount = await Notification.getUnreadCount(businessId, null);
    
    res.json({ count: unreadCount });
  } catch (error) {
    console.error('[GET /api/v2/notifications/unread-count] Error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * PUT /api/v2/notifications/:id/read
 * Mark a notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.markAsRead(id);
    
    res.json({ notification });
  } catch (error) {
    console.error('[PUT /api/v2/notifications/:id/read] Error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * PUT /api/v2/notifications/read-all
 * Mark all notifications as read for current business
 */
router.put('/read-all', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const userId = req.user.id;
    
    await Notification.markAllAsRead(businessId, null); // Mark all business notifications as read
    
    res.json({ success: true });
  } catch (error) {
    console.error('[PUT /api/v2/notifications/read-all] Error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

export default router;


