import express from 'express';
import { Message } from '../models/Message.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Note: SMS webhook handling moved to VAPI or can be added here if needed

// Get messages
router.get('/', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    console.log('[Messages API] ========== GET MESSAGES START ==========');
    console.log('[Messages API] businessId:', req.businessId, 'limit:', limit);
    
    if (!req.businessId) {
      console.error('[Messages API] No businessId in request');
      return res.status(400).json({ error: 'Business ID required' });
    }
    
    const messages = await Message.findByBusinessId(req.businessId, limit);
    console.log('[Messages API] Found messages:', messages?.length || 0);
    console.log('[Messages API] ========== GET MESSAGES SUCCESS ==========');
    
    // Ensure we always return an array
    res.json({ messages: messages || [] });
  } catch (error) {
    console.error('[Messages API] ========== GET MESSAGES ERROR ==========');
    console.error('[Messages API] Get messages error:', error);
    console.error('[Messages API] Error message:', error.message);
    console.error('[Messages API] Error stack:', error.stack);
    
    // Return empty array instead of error to prevent dashboard from breaking
    res.status(200).json({ messages: [] });
  }
});

// Handler function for marking message as follow up
const handleMarkAsFollowUp = async (req, res) => {
  try {
    console.log('[Messages API] ========== MARK AS FOLLOW UP START ==========');
    console.log('[Messages API] Message ID:', req.params.messageId);
    console.log('[Messages API] Business ID:', req.businessId);
    
    if (!req.businessId) {
      console.error('[Messages API] No businessId in request');
      return res.status(400).json({ error: 'Business ID required' });
    }
    
    const message = await Message.markAsFollowUp(req.params.messageId);
    
    if (!message) {
      console.error('[Messages API] Message not found');
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Verify message belongs to business
    if (message.business_id !== req.businessId) {
      console.error('[Messages API] Message does not belong to business');
      console.error('[Messages API] Message business_id:', message.business_id);
      console.error('[Messages API] Request business_id:', req.businessId);
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    console.log('[Messages API] ✅ Message marked as follow up successfully');
    console.log('[Messages API] ========== MARK AS FOLLOW UP SUCCESS ==========');
    res.json({ message });
  } catch (error) {
    console.error('[Messages API] ❌ Mark message follow up error:', error);
    console.error('[Messages API] Error message:', error.message);
    console.error('[Messages API] Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to mark message as follow up' });
  }
};

// Mark message as follow up (using 'followup' to avoid hyphen issues)
router.patch('/:messageId/followup', authenticate, handleMarkAsFollowUp);

// Also support hyphenated version for backwards compatibility
router.patch('/:messageId/follow-up', authenticate, handleMarkAsFollowUp);

// Mark message as read
router.patch('/:messageId/read', authenticate, async (req, res) => {
  try {
    const message = await Message.markAsRead(req.params.messageId);
    res.json({ message });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

export default router;

