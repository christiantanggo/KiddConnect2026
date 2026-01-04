// routes/analytics.js
// Analytics and reporting endpoints

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';
import { CallSession } from '../models/CallSession.js';
import { Message } from '../models/Message.js';
import { UsageMinutes } from '../models/UsageMinutes.js';
import { supabaseClient } from '../config/database.js';

const router = express.Router();

// Get call analytics for current business
router.get('/calls', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    let query = supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('business_id', req.businessId)
      .order('started_at', { ascending: false });
    
    if (startDate) {
      query = query.gte('started_at', startDate);
    }
    if (endDate) {
      query = query.lte('started_at', endDate);
    }
    
    const { data: calls, error } = await query;
    
    if (error) throw error;
    
    // Calculate analytics
    const analytics = {
      totalCalls: calls?.length || 0,
      totalDuration: calls?.reduce((sum, call) => sum + (call.duration_seconds || 0), 0) || 0,
      averageDuration: 0,
      callsByDay: {},
      callsByHour: {},
      callsByIntent: {},
      messagesTaken: 0,
    };
    
    if (calls && calls.length > 0) {
      analytics.averageDuration = analytics.totalDuration / analytics.totalCalls;
      
      calls.forEach(call => {
        const date = new Date(call.started_at);
        const day = date.toISOString().split('T')[0];
        const hour = date.getHours();
        
        analytics.callsByDay[day] = (analytics.callsByDay[day] || 0) + 1;
        analytics.callsByHour[hour] = (analytics.callsByHour[hour] || 0) + 1;
        
        if (call.intent) {
          analytics.callsByIntent[call.intent] = (analytics.callsByIntent[call.intent] || 0) + 1;
        }
        
        if (call.message_taken) {
          analytics.messagesTaken++;
        }
      });
    }
    
    res.json({ analytics });
  } catch (error) {
    console.error('Get call analytics error:', error);
    res.status(500).json({ error: 'Failed to get call analytics' });
  }
});

// Get usage trends
router.get('/usage/trends', authenticate, async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const business = await Business.findById(req.businessId);
    
    const trends = await UsageMinutes.getUsageTrends(req.businessId, parseInt(months));
    
    res.json({ trends });
  } catch (error) {
    console.error('Get usage trends error:', error);
    res.status(500).json({ error: 'Failed to get usage trends' });
  }
});

// Export data (CSV)
router.get('/export', authenticate, async (req, res) => {
  try {
    const { type = 'calls' } = req.query;
    
    if (type === 'calls') {
      const { data: calls, error } = await supabaseClient
        .from('call_sessions')
        .select('*')
        .eq('business_id', req.businessId)
        .order('started_at', { ascending: false });
      
      if (error) throw error;
      
      // Convert to CSV
      const headers = ['Date', 'Caller Number', 'Duration (seconds)', 'Intent', 'Message Taken'];
      const rows = calls?.map(call => [
        new Date(call.started_at).toISOString(),
        call.caller_number || '',
        call.duration_seconds || 0,
        call.intent || '',
        call.message_taken ? 'Yes' : 'No',
      ]) || [];
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="calls-export-${Date.now()}.csv"`);
      res.send(csv);
    } else if (type === 'messages') {
      const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('business_id', req.businessId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const headers = ['Date', 'Caller Name', 'Caller Phone', 'Message', 'Status'];
      const rows = messages?.map(msg => [
        new Date(msg.created_at).toISOString(),
        msg.caller_name || '',
        msg.caller_phone || '',
        (msg.message_text || '').replace(/"/g, '""'),
        msg.status || '',
      ]) || [];
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="messages-export-${Date.now()}.csv"`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Invalid export type' });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Track website events (button clicks, page views, etc.)
// POST /api/analytics/track
router.post('/track', async (req, res) => {
  try {
    const {
      event_name,
      category,
      label,
      action,
      value,
      location,
      custom_data = {},
      url,
      path,
      referrer,
      user_agent,
      timestamp,
    } = req.body;

    // Validate required fields
    if (!event_name) {
      return res.status(400).json({ error: 'event_name is required' });
    }

    // Extract location from custom_data if not provided directly (backwards compatibility)
    const finalLocation = location || custom_data.location || null;

    // Insert into database
    const { data, error } = await supabaseClient
      .from('website_analytics')
      .insert({
        event_name,
        category: category || null,
        label: label || null,
        action: action || null,
        value: value || null,
        location: finalLocation,
        custom_data: Object.keys(custom_data).length > 0 ? custom_data : null,
        url: url || null,
        path: path || null,
        referrer: referrer || null,
        user_agent: user_agent || null,
        created_at: timestamp || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // If table doesn't exist, return success anyway (analytics should never break the app)
      if (error.message?.includes('does not exist')) {
        console.warn('[Analytics] website_analytics table does not exist. Run migration: migrations/add_website_analytics_table.sql');
        return res.status(200).json({ success: true, message: 'Table not found - run migration' });
      }
      throw error;
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[Analytics] Error tracking event:', error);
    // Always return success - analytics should never break the app
    res.status(200).json({ success: false, error: error.message });
  }
});

export default router;

