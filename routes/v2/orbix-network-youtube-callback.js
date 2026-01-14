import express from 'express';
import { google } from 'googleapis';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const router = express.Router();

const MODULE_KEY = 'orbix-network';

/**
 * GET /api/v2/orbix-network/youtube/callback
 * Handle YouTube OAuth callback and exchange code for tokens
 * This route is PUBLIC (no authentication) because Google redirects users here
 */
router.get('/youtube/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=youtube_oauth_denied`);
    }
    
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=youtube_oauth_failed`);
    }
    
    const businessId = state;
    
    if (!businessId) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=invalid_state`);
    }
    
    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REDIRECT_URI) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=youtube_not_configured`);
    }
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Get channel info
    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelResponse = await youtube.channels.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      mine: true
    });
    
    const channel = channelResponse.data.items?.[0];
    if (!channel) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=no_channel_found`);
    }
    
    // Get or create module settings
    let moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = moduleSettings?.settings || {};
    
    // Update YouTube settings
    settings.youtube = {
      channel_id: channel.id,
      channel_title: channel.snippet?.title || '',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    };
    
    // Save settings
    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    
    // Redirect back to setup wizard with success
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?youtube_connected=true`);
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/youtube/callback] Error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=youtube_oauth_error`);
  }
});

export default router;

