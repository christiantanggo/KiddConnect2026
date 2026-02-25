/**
 * Kid Quiz Studio — YouTube OAuth Callback (PUBLIC route, no auth)
 * Mirrors orbix-network-youtube-callback.js but stores under module_key = 'kidquiz'
 * Mounted BEFORE authenticated routes in server.js
 */
import express from 'express';
import { google } from 'googleapis';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const router = express.Router();
const MODULE_KEY = 'kidquiz';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

router.get('/youtube/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=youtube_oauth_denied`);
    }
    if (!code) {
      return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=youtube_oauth_failed`);
    }

    const businessId = state;
    if (!businessId) {
      return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=invalid_state`);
    }

    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REDIRECT_URI) {
      return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=youtube_not_configured`);
    }

    // Build the kidquiz-specific redirect URI
    const raw = process.env.YOUTUBE_REDIRECT_URI || '';
    const kidquizRedirect = raw.replace(/orbix-network\/youtube\/callback/, 'kidquiz/youtube/callback');
    const redirectUri = kidquizRedirect.startsWith('http') ? kidquizRedirect : `https://${kidquizRedirect}`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      redirectUri
    );

    let tokens;
    try {
      const result = await oauth2Client.getToken(code);
      tokens = result.tokens;
    } catch (tokenError) {
      const data = tokenError?.response?.data;
      console.error('[KidQuiz YouTube Callback] getToken failed:', data?.error, data?.error_description);
      if (data?.error === 'invalid_grant' || tokenError?.message?.includes('invalid_grant')) {
        return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=invalid_grant`);
      }
      throw tokenError;
    }

    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelResponse = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = channelResponse.data.items?.[0];
    if (!channel) {
      return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=no_channel_found`);
    }

    const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = existing?.settings ? { ...existing.settings } : {};
    settings.youtube = {
      channel_id: channel.id,
      channel_title: channel.snippet?.title || '',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    };

    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    console.log('[KidQuiz YouTube Callback] Saved credentials businessId=', businessId, 'channel=', channel.id);

    res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?youtube_connected=true`);
  } catch (err) {
    const isInvalidGrant = err?.response?.data?.error === 'invalid_grant' || err?.message?.includes('invalid_grant');
    console.error('[KidQuiz YouTube Callback] Error:', err?.message);
    if (isInvalidGrant) {
      return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=invalid_grant`);
    }
    res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=youtube_oauth_error`);
  }
});

export default router;
