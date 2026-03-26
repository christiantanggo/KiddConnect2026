/**
 * Movie Review Studio — YouTube Publisher
 */
import { google } from 'googleapis';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const MODULE_KEY = 'movie-review';

/**
 * Build OAuth2 client and token persistence for a given credentials slot.
 * @param {object} slot - { clientId, clientSecret, access_token, refresh_token, token_expiry }
 * @param {string} redirectUri
 * @param {'youtube'|'youtube_manual'} slotKey - which key in settings to update on token refresh
 */
function buildOAuth2Client(businessId, slot, redirectUri, slotKey) {
  const { clientId, clientSecret, access_token, refresh_token, token_expiry } = slot;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token,
    refresh_token,
    expiry_date: token_expiry ? new Date(token_expiry).getTime() : undefined,
  });

  oauth2Client.on('tokens', async (tokens) => {
    try {
      const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
      const settings = existing?.settings ? { ...existing.settings } : {};
      const target = settings[slotKey] || {};
      if (slotKey === 'youtube_manual') {
        settings.youtube_manual = {
          ...target,
          manual_access_token: tokens.access_token || target.manual_access_token,
          manual_refresh_token: tokens.refresh_token || target.manual_refresh_token,
          manual_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : target.manual_token_expiry,
        };
      } else {
        settings.youtube = {
          ...target,
          access_token: tokens.access_token || target.access_token,
          refresh_token: tokens.refresh_token || target.refresh_token,
          token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : target.token_expiry,
        };
      }
      await ModuleSettings.update(businessId, MODULE_KEY, settings);
    } catch (e) {
      console.error('[MovieReview Publisher] Token refresh save failed:', e.message);
    }
  });

  return oauth2Client;
}

async function getYouTubeClient(businessId) {
  const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const settings = ms?.settings || {};
  const yt = settings.youtube || {};
  const ytManual = settings.youtube_manual || {};

  // Same as Kid Quiz: use manual slot when manual OAuth is configured and connected
  const useManual = !!(ytManual.manual_client_id && ytManual.manual_access_token);
  const slot = useManual
    ? {
        clientId: (ytManual.manual_client_id || '').trim() || process.env.YOUTUBE_CLIENT_ID,
        clientSecret: (ytManual.manual_client_secret || '').trim() || process.env.YOUTUBE_CLIENT_SECRET,
        access_token: ytManual.manual_access_token,
        refresh_token: ytManual.manual_refresh_token,
        token_expiry: ytManual.manual_token_expiry,
      }
    : {
        clientId: (yt.client_id || '').trim() || process.env.YOUTUBE_CLIENT_ID,
        clientSecret: (yt.client_secret || '').trim() || process.env.YOUTUBE_CLIENT_SECRET,
        access_token: yt.access_token,
        refresh_token: yt.refresh_token,
        token_expiry: yt.token_expiry,
      };

  if (!slot.access_token) {
    throw new Error('YouTube not connected for Movie Review Studio. Go to Settings and connect YouTube.');
  }
  if (!slot.clientId || !slot.clientSecret) {
    throw new Error('YouTube OAuth not configured. Add Client ID and Secret in Settings → Upload OAuth app, or set YOUTUBE_CLIENT_ID/SECRET on the server.');
  }

  // Movie Review shares the orbix-network callback URL (same as auth-url route)
  const raw = process.env.YOUTUBE_REDIRECT_URI || '';
  const redirectUri = raw.startsWith('http') ? raw : `https://${raw}`;

  return buildOAuth2Client(
    businessId,
    slot,
    redirectUri,
    useManual ? 'youtube_manual' : 'youtube'
  );
}

export async function publishMovieReview(project, businessId) {
  const projectId = project.id;
  console.log('[MovieReview Publisher] Starting projectId=%s businessId=%s', projectId, businessId);

  try {
    if (!project.render_url) throw new Error('No render URL. Render the video first.');

    // Download video (same as Kid Quiz: timeout so we don't hang forever)
    const renderUrl = project.render_url.split('?')[0];
    console.log('[MovieReview Publisher] Downloading render projectId=%s url=%s', projectId, renderUrl);
    const axios = (await import('axios')).default;
    const resp = await axios.get(renderUrl, { responseType: 'arraybuffer', timeout: 60000 });
    const buf = Buffer.from(resp.data);
    console.log('[MovieReview Publisher] Downloaded %s bytes projectId=%s', buf.length, projectId);

    const { writeFile, unlink } = await import('fs');
    const { promisify } = await import('util');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const { randomUUID } = await import('crypto');
    const writeAsync = promisify(writeFile);
    const unlinkAsync = promisify(unlink);

    const tmpPath = join(tmpdir(), `mr-upload-${randomUUID()}.mp4`);
    await writeAsync(tmpPath, buf);
    console.log('[MovieReview Publisher] Wrote temp file projectId=%s', projectId);

    console.log('[MovieReview Publisher] Getting YouTube client projectId=%s', projectId);
    const oauth2Client = await getYouTubeClient(businessId);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    console.log('[MovieReview Publisher] YouTube client ready, inserting video projectId=%s', projectId);

    const title = (project.yt_title || project.movie_title || 'Movie Review').slice(0, 100);
    const description = (project.yt_description || `${project.movie_title} review`).slice(0, 5000);
    const tags = Array.isArray(project.yt_hashtags)
      ? project.yt_hashtags.map(h => String(h).replace(/^#/, '')).slice(0, 30)
      : [];

    const { Readable } = await import('stream');
    const videoBuffer = buf;
    const videoStream = Readable.from(videoBuffer);

    const uploadResp = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          tags,
          categoryId: '1', // Film & Animation
        },
        status: {
          privacyStatus: (project.privacy || 'UNLISTED').toLowerCase(),
          selfDeclaredMadeForKids: false,
        },
      },
      media: { mimeType: 'video/mp4', body: videoStream },
    });

    const videoId = uploadResp.data.id;
    const youtubeUrl = `https://www.youtube.com/shorts/${videoId}`;

    await supabaseClient
      .from('movie_review_projects')
      .update({
        status: 'PUBLISHED',
        youtube_video_id: videoId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    try { unlinkAsync(tmpPath).catch(() => {}); } catch (_) {}
    console.log(`[MovieReview Publisher] Published videoId=${videoId}`);
    return { videoId, youtubeUrl };
  } catch (err) {
    const rawMsg = String(err.message || err.response?.data?.error || '');
    const lower = rawMsg.toLowerCase();
    const isInvalidClient = lower.includes('invalid_client');
    const isInvalidGrant = lower.includes('invalid_grant');
    console.error('[MovieReview Publisher] FAILED projectId=%s:', projectId, err.message);
    console.error('[MovieReview Publisher] Stack:', err.stack);
    if (isInvalidClient) {
      console.error('[MovieReview Publisher] invalid_client usually means the OAuth Client ID/Secret or redirect URI do not match the app that was used when you connected YouTube. In Movie Review Settings, either use the same Upload OAuth app (and same YOUTUBE_REDIRECT_URI on the server) or disconnect and reconnect YouTube.');
    }
    if (isInvalidGrant) {
      console.error('[MovieReview Publisher] invalid_grant: Google rejected the refresh token (revoked, expired, or app credentials changed). User must disconnect YouTube in Movie Review settings and run Connect again.');
    }
    let userMessage = (err.message || 'Upload failed').slice(0, 500);
    if (isInvalidGrant) {
      userMessage =
        'YouTube sign-in expired or was revoked. In Movie Review → Settings, disconnect YouTube, then connect again and retry upload.';
    }
    const baseUpdate = { status: 'FAILED', updated_at: new Date().toISOString() };
    const { error: updateErr } = await supabaseClient
      .from('movie_review_projects')
      .update({ ...baseUpdate, upload_error: userMessage })
      .eq('id', projectId);
    if (updateErr) {
      await supabaseClient
        .from('movie_review_projects')
        .update(baseUpdate)
        .eq('id', projectId);
    }
    throw err;
  }
}
