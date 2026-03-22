/**
 * Riddle (per-channel) YouTube OAuth callback — PUBLIC route, no auth.
 * Redirect URI in Google Cloud must match getRiddleYoutubeRedirectUri() for your API host
 * (e.g. https://api.tavarios.com/api/v2/riddle/youtube/callback).
 * State = businessId:orbixChannelId or businessId:orbixChannelId:setup
 */
import express from 'express';
import { google } from 'googleapis';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { defaultOrbixYoutubeCallbackUrl, getFrontendPublicBaseUrl } from '../../config/public-urls.js';

const router = express.Router();
const MODULE_KEY = 'orbix-network';
const FRONTEND = getFrontendPublicBaseUrl();

/** Single source of truth for per-channel (custom) OAuth redirect URI. Used by auth-url and by this callback so they always match. */
export function getRiddleYoutubeRedirectUri() {
  const template = (process.env.YOUTUBE_REDIRECT_URI || '').trim() || defaultOrbixYoutubeCallbackUrl();
  let base = template.replace(/\/api\/v2\/.*$/, '').replace(/\/$/, '');
  if (!base.startsWith('http')) {
    base = (base.startsWith('localhost') ? 'http://' : 'https://') + base;
  }
  return `${base}/api/v2/riddle/youtube/callback`;
}

function getRedirectUri() {
  return getRiddleYoutubeRedirectUri();
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
  let usageManual = false;
  if (rest && rest.includes(':')) {
    const parts = rest.split(':');
    if (parts[parts.length - 1] === 'setup') {
      redirectToSetup = true;
      parts.pop();
    }
    if (parts[parts.length - 1] === 'manual') {
      usageManual = true;
      parts.pop();
    }
    businessId = parts[0];
    orbixChannelId = parts.length > 1 ? parts.slice(1).join(':') : null;
  }
  return { businessId, orbixChannelId, redirectToSetup, usageManual, redirectBase: base };
}

router.get('/youtube/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    // Log exactly what we received so we can see why code might be missing (proxy stripping params? Google sent error? wrong URL?)
    console.log('[Riddle YouTube Callback] received query:', JSON.stringify({ hasCode: !!code, hasState: !!state, error: error || null, queryKeys: Object.keys(req.query || {}) }));

    const { redirectBase } = parseState(state || '');

    if (error) {
      console.log('[Riddle YouTube Callback] Google returned error param:', error, 'description:', req.query.error_description || '');
      const errParam = error === 'redirect_uri_mismatch' ? 'redirect_uri_mismatch' : 'youtube_oauth_denied';
      return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=${errParam}`);
    }
    if (!code) {
      console.warn('[Riddle YouTube Callback] No code in request — cannot exchange for tokens. Full URL path+query:', req.url);
      return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=youtube_oauth_failed`);
    }

    const { businessId, orbixChannelId, redirectToSetup, usageManual } = parseState(state || '');

    if (!businessId || !orbixChannelId) {
      return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=invalid_state`);
    }

    const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const byChannel = existing?.settings?.youtube_by_channel || {};
    const channelEntry = byChannel[orbixChannelId] || {};
    const clientId = ((usageManual ? channelEntry.manual_client_id : channelEntry.client_id) || '').trim();
    const clientSecret = ((usageManual ? channelEntry.manual_client_secret : channelEntry.client_secret) || '').trim();

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
      console.error('[Riddle YouTube Callback] getToken failed:', data?.error, data?.error_description, 'redirect_uri=', redirectUri);
      if (data?.error === 'invalid_grant' || tokenError?.message?.includes('invalid_grant')) {
        return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=invalid_grant`);
      }
      throw tokenError;
    }

    oauth2Client.setCredentials(tokens);
    let channel;
    try {
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const channelResponse = await youtube.channels.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        mine: true
      });
      channel = channelResponse.data.items?.[0];
    } catch (apiErr) {
      const msg = apiErr?.message || '';
      if (msg.includes('has not been used') || msg.includes('is disabled') || msg.includes('Enable it by visiting')) {
        const projectMatch = msg.match(/project (\d+)/);
        const project = projectMatch ? projectMatch[1] : '';
        const enableUrl = project
          ? `https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=${project}`
          : 'https://console.developers.google.com/apis/library/youtube.googleapis.com';
        return res.redirect(`${redirectBase}/dashboard/v2/modules/orbix-network/settings?error=youtube_api_not_enabled&enable_url=${encodeURIComponent(enableUrl)}`);
      }
      throw apiErr;
    }
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
    if (usageManual) {
      settings.youtube_by_channel[orbixChannelId] = {
        ...existingChannel,
        manual_channel_id: ytCreds.channel_id,
        manual_channel_title: ytCreds.channel_title,
        manual_access_token: ytCreds.access_token,
        manual_refresh_token: ytCreds.refresh_token,
        manual_token_expiry: ytCreds.token_expiry,
        ...(existingChannel.manual_client_id && { manual_client_id: existingChannel.manual_client_id }),
        ...(existingChannel.manual_client_secret && { manual_client_secret: existingChannel.manual_client_secret })
      };
    } else {
      settings.youtube_by_channel[orbixChannelId] = {
        ...existingChannel,
        ...ytCreds,
        ...(existingChannel.client_id && { client_id: existingChannel.client_id }),
        ...(existingChannel.client_secret && { client_secret: existingChannel.client_secret })
      };
    }

    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    console.log('[Riddle YouTube Callback] Saved credentials businessId=', businessId, 'orbixChannelId=', orbixChannelId, 'usage=', usageManual ? 'manual' : 'auto', 'youtube_channel_id=', channel.id);

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
