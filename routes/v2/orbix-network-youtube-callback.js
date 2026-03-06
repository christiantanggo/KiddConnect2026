import express from 'express';
import { google } from 'googleapis';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const router = express.Router();

const MODULE_KEY = 'orbix-network';
const DEFAULT_FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

function getRedirectBase(stateStr) {
  if (!stateStr || !stateStr.includes('|')) return DEFAULT_FRONTEND;
  const idx = stateStr.lastIndexOf('|');
  const base = stateStr.slice(idx + 1).trim();
  return (base.startsWith('https://') || base.startsWith('http://')) ? base.replace(/\/$/, '') : DEFAULT_FRONTEND;
}

/**
 * GET /api/v2/orbix-network/youtube/callback
 * Handle YouTube OAuth callback and exchange code for tokens
 * This route is PUBLIC (no authentication) because Google redirects users here
 */
router.get('/youtube/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const redirectBase = getRedirectBase(state || '');
    let rest = state;
    if (state && state.includes('|')) rest = state.slice(0, state.lastIndexOf('|'));
    const fromSettings = !!(rest && rest.includes(':'));
    const isMovieReviewState = (rest || '').includes('movie-review');
    const errPath = isMovieReviewState ? '/dashboard/v2/modules/movie-review/settings' : (fromSettings ? '/dashboard/v2/modules/orbix-network/settings' : '/modules/orbix-network/setup');

    if (error) {
      return res.redirect(`${redirectBase}${errPath}?error=youtube_oauth_denied`);
    }

    if (!code) {
      return res.redirect(`${redirectBase}${errPath}?error=youtube_oauth_failed`);
    }
    let businessId = rest;
    let orbixChannelId = null;
    let redirectToSetup = false;
    let isKidquiz = false;
    let isMovieReview = false;
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
      if (parts[parts.length - 1] === 'kidquiz') {
        isKidquiz = true;
        parts.pop();
      }
      if (parts[parts.length - 1] === 'movie-review') {
        isMovieReview = true;
        parts.pop();
      }
      businessId = parts[0];
      orbixChannelId = parts.length > 1 ? parts.slice(1).join(':') : null;
    }

    if (!businessId) {
      return res.redirect(`${redirectBase}/modules/orbix-network/setup?error=invalid_state`);
    }

    const raw = process.env.YOUTUBE_REDIRECT_URI || '';
    const redirectUri = raw.startsWith('http') ? raw : `https://${raw}`;
    if (!redirectUri || redirectUri === 'https://') {
      return res.redirect(`${redirectBase}/modules/orbix-network/setup?error=youtube_not_configured`);
    }

    // Use per-channel OAuth client (auto or manual slot) or env. Manual slot can use second project via YOUTUBE_MANUAL_CLIENT_*.
    let clientId = process.env.YOUTUBE_CLIENT_ID;
    let clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (isMovieReview) {
      const mrExisting = await ModuleSettings.findByBusinessAndModule(businessId, 'movie-review');
      const mrSettings = mrExisting?.settings || {};
      if (usageManual) {
        const ytManual = mrSettings.youtube_manual || {};
        if (ytManual.manual_client_id && ytManual.manual_client_secret) {
          clientId = ytManual.manual_client_id;
          clientSecret = ytManual.manual_client_secret;
        }
      } else {
        const yt = mrSettings.youtube || {};
        if (yt.client_id && yt.client_secret) {
          clientId = yt.client_id;
          clientSecret = yt.client_secret;
        }
      }
    } else if (orbixChannelId && !isKidquiz) {
      const existing = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
      const byChannel = existing?.settings?.youtube_by_channel || {};
      const channelEntry = byChannel[orbixChannelId];
      if (usageManual && channelEntry?.manual_client_id && channelEntry?.manual_client_secret) {
        clientId = channelEntry.manual_client_id;
        clientSecret = channelEntry.manual_client_secret;
      } else if (!usageManual && channelEntry?.client_id && channelEntry?.client_secret) {
        clientId = channelEntry.client_id;
        clientSecret = channelEntry.client_secret;
      }
    }
    if (!clientId || !clientSecret) {
      return res.redirect(`${redirectBase}${errPath}?error=youtube_not_configured`);
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

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
        return res.redirect(`${redirectBase}${errPath}?error=invalid_grant`);
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
      return res.redirect(`${redirectBase}${errPath}?error=no_channel_found`);
    }

    const ytCreds = {
      channel_id: channel.id,
      channel_title: channel.snippet?.title || '',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    };

    if (isKidquiz) {
      const kqExisting = await ModuleSettings.findByBusinessAndModule(businessId, 'kidquiz');
      const kqSettings = kqExisting?.settings ? { ...kqExisting.settings } : {};
      kqSettings.youtube = ytCreds;
      await ModuleSettings.update(businessId, 'kidquiz', kqSettings);
      console.log('[YouTube Callback] Saved YouTube credentials for KidQuiz businessId=', businessId, 'youtube_channel_id=', channel.id);
      return res.redirect(`${redirectBase}/dashboard/v2/modules/kidquiz/settings?youtube_connected=true`);
    }

    if (isMovieReview) {
      const mrExisting = await ModuleSettings.findByBusinessAndModule(businessId, 'movie-review');
      const mrSettings = mrExisting?.settings ? { ...mrExisting.settings } : {};
      if (usageManual) {
        mrSettings.youtube_manual = mrSettings.youtube_manual || {};
        const ex = mrSettings.youtube_manual;
        mrSettings.youtube_manual = {
          ...(ex.manual_client_id && { manual_client_id: ex.manual_client_id }),
          ...(ex.manual_client_secret && { manual_client_secret: ex.manual_client_secret }),
          manual_channel_id: ytCreds.channel_id,
          manual_channel_title: ytCreds.channel_title,
          manual_access_token: ytCreds.access_token,
          manual_refresh_token: ytCreds.refresh_token,
          manual_token_expiry: ytCreds.token_expiry
        };
      } else {
        mrSettings.youtube = { ...(mrSettings.youtube || {}), ...ytCreds };
        const ex = mrSettings.youtube;
        if (ex.client_id) mrSettings.youtube.client_id = ex.client_id;
        if (ex.client_secret) mrSettings.youtube.client_secret = ex.client_secret;
      }
      await ModuleSettings.update(businessId, 'movie-review', mrSettings);
      console.log('[YouTube Callback] Saved YouTube credentials for Movie Review Studio businessId=', businessId, 'usage=', usageManual ? 'manual' : 'auto', 'youtube_channel_id=', channel.id);
      return res.redirect(`${redirectBase}/dashboard/v2/modules/movie-review/settings?youtube_connected=true`);
    }

    const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = existing?.settings ? { ...existing.settings } : {};

    if (orbixChannelId) {
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
    } else {
      settings.youtube = ytCreds;
    }

    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    console.log('[YouTube Callback] Saved YouTube credentials for businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'legacy', 'youtube_channel_id=', channel.id);

    const redirect = redirectToSetup
      ? `${redirectBase}/modules/orbix-network/setup?youtube_connected=true`
      : (orbixChannelId
          ? `${redirectBase}/dashboard/v2/modules/orbix-network/settings?youtube_connected=true`
          : `${redirectBase}/modules/orbix-network/setup?youtube_connected=true`);
    res.redirect(redirect);
  } catch (error) {
    const redirectBase = getRedirectBase(req.query.state || '');
    let rest = req.query.state;
    if (rest && rest.includes('|')) rest = rest.slice(0, rest.lastIndexOf('|'));
    const fromSettings = !!(rest && rest.includes(':'));
    const errPath = fromSettings ? '/dashboard/v2/modules/orbix-network/settings' : '/modules/orbix-network/setup';
    const isInvalidGrant = error?.response?.data?.error === 'invalid_grant' || error?.message?.includes('invalid_grant');
    console.error('[GET /api/v2/orbix-network/youtube/callback] Error:', error?.message || error);
    if (isInvalidGrant) {
      return res.redirect(`${redirectBase}${errPath}?error=invalid_grant`);
    }
    res.redirect(`${redirectBase}${errPath}?error=youtube_oauth_error`);
  }
});

export default router;




