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
    
    let businessId = state;
    let orbixChannelId = null;
    let redirectToSetup = false;
    if (state && state.includes(':')) {
      const parts = state.split(':');
      if (parts[parts.length - 1] === 'setup') {
        redirectToSetup = true;
        parts.pop();
      }
      businessId = parts[0];
      orbixChannelId = parts.length > 1 ? parts.slice(1).join(':') : null;
    }
    
    if (!businessId) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=invalid_state`);
    }
    
    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REDIRECT_URI) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=youtube_not_configured`);
    }

    const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      redirectUri
    );

    // Exchange code for tokens (invalid_grant = redirect_uri mismatch, code already used, or code expired)
    let tokens;
    console.log('[YouTube Callback] Exchanging code, redirect_uri=', redirectUri);
    try {
      const result = await oauth2Client.getToken(code);
      tokens = result.tokens;
    } catch (tokenError) {
      const data = tokenError?.response?.data;
      console.error('[YouTube Callback] getToken failed:', data?.error, data?.error_description, 'redirect_uri=', redirectUri);
      const isInvalidGrant = data?.error === 'invalid_grant' || tokenError?.message?.includes('invalid_grant');
      if (isInvalidGrant) {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=invalid_grant`);
      }
      throw tokenError;
    }
    
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
    
    const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = existing?.settings ? { ...existing.settings } : {};
    const ytCreds = {
      channel_id: channel.id,
      channel_title: channel.snippet?.title || '',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    };

    if (orbixChannelId) {
      settings.youtube_by_channel = settings.youtube_by_channel || {};
      settings.youtube_by_channel[orbixChannelId] = ytCreds;
    } else {
      settings.youtube = ytCreds;
    }

    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    console.log('[YouTube Callback] Saved YouTube credentials for businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'legacy', 'youtube_channel_id=', channel.id);

    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirect = redirectToSetup
      ? `${base}/modules/orbix-network/setup?youtube_connected=true`
      : (orbixChannelId
          ? `${base}/dashboard/v2/modules/orbix-network/settings?youtube_connected=true`
          : `${base}/modules/orbix-network/setup?youtube_connected=true`);
    res.redirect(redirect);
  } catch (error) {
    const isInvalidGrant = error?.response?.data?.error === 'invalid_grant' || error?.message?.includes('invalid_grant');
    console.error('[GET /api/v2/orbix-network/youtube/callback] Error:', error?.message || error);
    if (isInvalidGrant) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=invalid_grant`);
    }
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/modules/orbix-network/setup?error=youtube_oauth_error`);
  }
});

export default router;




