/**
 * Riddle (per-channel) YouTube OAuth callback — PUBLIC route, no auth.
 * Used when a channel has a custom OAuth app (separate quota). Redirect URI in Google must be
 * https://api.tavarios.com/api/v2/riddle/youtube/callback
 * State = businessId:orbixChannelId or businessId:orbixChannelId:setup
 */
import express from 'express';
import { google } from 'googleapis';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const router = express.Router();
const MODULE_KEY = 'orbix-network';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

function getRedirectUri() {
  if (process.env.NODE_ENV === 'production' && (process.env.YOUTUBE_REDIRECT_URI || '').includes('api.tavarios.com')) {
    return 'https://api.tavarios.com/api/v2/riddle/youtube/callback';
  }
  const raw = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5001/api/v2/orbix-network/youtube/callback';
  let base = raw.replace(/\/api\/v2\/.+$/, '').replace(/\/$/, '');
  if (!base.startsWith('http')) base = (base.startsWith('localhost') ? 'http://' : 'https://') + base;
  return `${base}/api/v2/riddle/youtube/callback`;
}

function getRedirectBase(stateStr) {
  if (!stateStr || !stateStr.includes('|')) return FRONTEND;
  const idx = stateStr.lastIndexOf('|');
  const base = stateStr.slice(idx + 1).trim();
  return (base.startsWith('https://') || base.startsWith('http://')) ? base.replace(/\/$/, '') : FRONTEND;
}

function parseState(stateStr) {
  const base = getRedirectBase(stateStr);
  let rest = stateStr;
  if (stateStr && stateStr.includes('|')) rest = stateStr.slice(0, stateStr.lastIndexOf('|'));
  let businessId = rest;
  let orbixChannelId = null;
  let redirectToSetup = false;
  if (rest && rest.includes(':')) {
    const parts = rest.split(':');
    if (parts[parts.length - 1] === 'setup') {
      redirectToSetup = true;
      parts.pop();
    }
    businessId = parts[0];
    orbixChannelId = parts.length > 1 ? parts.slice(1).join(':') : null;
  }
  return { businessId, orbixChannelId, redirectToSetup, redirectBase: base };
}

router.get('/youtube/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    const { redirectBase } = parseState(state || '');

    if (error) {
      return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=youtube_oauth_denied`);
    }
    if (!code) {
      return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=youtube_oauth_failed`);
    }

    const { businessId, orbixChannelId, redirectToSetup } = parseState(state || '');

    if (!businessId || !orbixChannelId) {
      return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=invalid_state`);
    }

    const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const byChannel = existing?.settings?.youtube_by_channel || {};
    const channelEntry = byChannel[orbixChannelId] || {};
    const clientId = (channelEntry.client_id || '').trim();
    const clientSecret = (channelEntry.client_secret || '').trim();

    if (!clientId || !clientSecret) {
      return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=youtube_not_configured`);
    }

    const redirectUri = getRedirectUri();
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    let tokens;
    try {
      const result = await oauth2Client.getToken(code);
      tokens = result.tokens;
    } catch (tokenError) {
      const data = tokenError?.response?.data;
      console.error('[Riddle YouTube Callback] getToken failed:', data?.error, data?.error_description);
      if (data?.error === 'invalid_grant' || tokenError?.message?.includes('invalid_grant')) {
        return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=invalid_grant`);
      }
      throw tokenError;
    }

    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelResponse = await youtube.channels.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      mine: true
    });
    const channel = channelResponse.data.items?.[0];
    if (!channel) {
      return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=no_channel_found`);
    }

    const ytCreds = {
      channel_id: channel.id,
      channel_title: channel.snippet?.title || '',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    };

    const settings = existing?.settings ? { ...existing.settings } : {};
    settings.youtube_by_channel = settings.youtube_by_channel || {};
    const existingChannel = settings.youtube_by_channel[orbixChannelId] || {};
    settings.youtube_by_channel[orbixChannelId] = {
      ...existingChannel,
      ...ytCreds,
      ...(existingChannel.client_id && { client_id: existingChannel.client_id }),
      ...(existingChannel.client_secret && { client_secret: existingChannel.client_secret })
    };

    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    console.log('[Riddle YouTube Callback] Saved credentials businessId=', businessId, 'orbixChannelId=', orbixChannelId, 'youtube_channel_id=', channel.id);

    const redirect = redirectToSetup
      ? `${redirectBase}/modules/orbix-network/setup?youtube_connected=true`
      : `${redirectBase}/dashboard/v2/modules/orbix-network/settings?youtube_connected=true`;
    res.redirect(redirect);
  } catch (err) {
    const { redirectBase } = parseState(req.query.state || '');
    const isInvalidGrant = err?.response?.data?.error === 'invalid_grant' || err?.message?.includes('invalid_grant');
    console.error('[Riddle YouTube Callback] Error:', err?.message);
    if (isInvalidGrant) {
      return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=invalid_grant`);
    }
    res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=youtube_oauth_error`);
  }
});

export default router;
