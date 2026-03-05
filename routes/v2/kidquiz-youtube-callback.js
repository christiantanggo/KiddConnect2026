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

    const stateParts = (state || '').split(':');
    const businessId = stateParts[0] || state;
    const isManual = stateParts[2] === 'manual';
    if (!businessId) {
      return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=invalid_state`);
    }

    let clientId, clientSecret;
    if (isManual) {
      const existing = await ModuleSettings.findByBusinessAndModule(businessId, 'kidquiz');
      const ytManual = existing?.settings?.youtube_manual || {};
      clientId = (ytManual.manual_client_id || '').trim();
      clientSecret = (ytManual.manual_client_secret || '').trim();
      if (!clientId || !clientSecret) {
        return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=youtube_not_configured`);
      }
    } else {
      const existingAuto = await ModuleSettings.findByBusinessAndModule(businessId, 'kidquiz');
      const yt = existingAuto?.settings?.youtube || {};
      clientId = (yt.client_id || '').trim() || (process.env.KIDQUIZ_YOUTUBE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID);
      clientSecret = (yt.client_secret || '').trim() || (process.env.KIDQUIZ_YOUTUBE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET);
      if (!clientId || !clientSecret) {
        return res.redirect(`${FRONTEND}/dashboard/v2/modules/kidquiz/settings?error=youtube_not_configured`);
      }
    }

    const raw = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5001/api/v2/orbix-network/youtube/callback';
    const baseUrl = raw.replace(/\/api\/v2\/.+$/, '');
    const redirectUri = `${baseUrl}/api/v2/kidquiz/youtube/callback`;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

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

    const existing = await ModuleSettings.findByBusinessAndModule(businessId, 'kidquiz');
    const settings = existing?.settings ? { ...existing.settings } : {};
    const ytCreds = {
      channel_id: channel.id,
      channel_title: channel.snippet?.title || '',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    };

    if (isManual) {
      settings.youtube_manual = settings.youtube_manual || {};
      const ex = settings.youtube_manual;
      settings.youtube_manual = {
        ...(ex.manual_client_id && { manual_client_id: ex.manual_client_id }),
        ...(ex.manual_client_secret && { manual_client_secret: ex.manual_client_secret }),
        manual_access_token: ytCreds.access_token,
        manual_refresh_token: ytCreds.refresh_token,
        manual_channel_id: ytCreds.channel_id,
        manual_channel_title: ytCreds.channel_title,
        manual_token_expiry: ytCreds.token_expiry
      };
    } else {
      settings.youtube = ytCreds;
    }

    await ModuleSettings.update(businessId, 'kidquiz', settings);
    console.log('[KidQuiz YouTube Callback] Saved credentials businessId=', businessId, 'channel=', channel.id, 'slot=', isManual ? 'manual' : 'default');

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
