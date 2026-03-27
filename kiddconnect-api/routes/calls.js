// routes/calls.js
// Call session routes (VAPI-based)

import express from 'express';
import { CallSession } from '../models/CallSession.js';
import { authenticate } from '../middleware/auth.js';
import { supabaseClient } from '../config/database.js';

const router = express.Router();

// Get call sessions for authenticated business
router.get('/', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    console.log('[Calls API] ========== GET CALLS START ==========');
    console.log('[Calls API] businessId:', req.businessId, 'limit:', limit);
    
    if (!req.businessId) {
      console.error('[Calls API] No businessId in request');
      return res.status(400).json({ error: 'Business ID required' });
    }
    
    const calls = await CallSession.findByBusinessId(req.businessId, limit);
    console.log('[Calls API] Found calls:', calls?.length || 0);
    console.log('[Calls API] ========== GET CALLS SUCCESS ==========');
    
    // Ensure we always return an array
    res.json({ calls: calls || [] });
  } catch (error) {
    console.error('[Calls API] ========== GET CALLS ERROR ==========');
    console.error('[Calls API] Get calls error:', error);
    console.error('[Calls API] Error message:', error.message);
    console.error('[Calls API] Error stack:', error.stack);
    
    // Return empty array instead of error to prevent dashboard from breaking
    res.status(200).json({ calls: [] });
  }
});

// Get specific call session
router.get('/:callId', authenticate, async (req, res) => {
  try {
    // Try database ID first (most common case from frontend)
    let call = await CallSession.findById(req.params.callId);
    
    // If not found by ID, try VAPI call ID, then voximplant (legacy)
    if (!call) {
      call = await CallSession.findByVapiCallId(req.params.callId);
    }
    if (!call) {
      call = await CallSession.findByVoximplantCallId(req.params.callId);
    }
    
    if (!call || call.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    res.json({ call });
  } catch (error) {
    console.error('Get call error:', error);
    res.status(500).json({ error: 'Failed to get call' });
  }
});

// Delete call session (with ownership check)
router.delete('/:callId', authenticate, async (req, res) => {
  try {
    const call = await CallSession.findById(req.params.callId);
    if (!call || call.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Call not found' });
    }
    const { error } = await supabaseClient
      .from('call_sessions')
      .delete()
      .eq('id', req.params.callId)
      .eq('business_id', req.businessId);
    if (error) {
      console.error('Delete call error:', error);
      return res.status(500).json({ error: 'Failed to delete call' });
    }
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete call error:', error);
    res.status(500).json({ error: 'Failed to delete call' });
  }
});

export default router;
