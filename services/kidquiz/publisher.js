/**
 * Kid Quiz Studio — YouTube Publisher
 * Uploads rendered mp4 to YouTube using stored OAuth tokens.
 * Completely separate from orbix-network publisher.
 */
import { google } from 'googleapis';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { defaultOrbixYoutubeCallbackUrl } from '../../config/public-urls.js';

const MODULE_KEY = 'kidquiz';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_KIDQUIZ_RENDERS || 'kidquiz-videos';

/**
 * Use only stored credentials (same pattern as Orbix/Movie Review). No env fallback —
 * connect and upload both use whatever OAuth app is configured in Kid Quiz Settings.
 */
async function getYouTubeClient(businessId) {
  const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const settings = moduleSettings?.settings || {};
  const ytManual = settings.youtube_manual || {};
  const yt = settings.youtube;

  const useManual = !!(ytManual.manual_client_id && ytManual.manual_access_token);
  let clientId, clientSecret, accessToken, refreshToken, tokenExpiry, persistSlot;

  if (useManual) {
    clientId = (ytManual.manual_client_id || '').trim();
    clientSecret = (ytManual.manual_client_secret || '').trim();
    accessToken = ytManual.manual_access_token;
    refreshToken = ytManual.manual_refresh_token;
    tokenExpiry = ytManual.manual_token_expiry;
    persistSlot = 'youtube_manual';
  } else {
    clientId = (yt?.client_id || '').trim();
    clientSecret = (yt?.client_secret || '').trim();
    if (!clientId || !clientSecret) {
      throw new Error('YouTube OAuth not configured. In Kid Quiz Studio → Settings add Client ID and Secret (Upload OAuth app), save, then connect YouTube.');
    }
    if (!yt?.access_token) {
      throw new Error('YouTube not connected for Kid Quiz Studio. Go to Kid Quiz Studio → Settings and connect YouTube (Upload OAuth section).');
    }
    accessToken = yt.access_token;
    refreshToken = yt.refresh_token;
    tokenExpiry = yt.token_expiry;
    persistSlot = 'youtube';
  }

  const raw = process.env.YOUTUBE_REDIRECT_URI || defaultOrbixYoutubeCallbackUrl();
  const baseUrl = raw.replace(/\/api\/v2\/.+$/, '');
  const redirectUri = `${baseUrl}/api/v2/kidquiz/youtube/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: tokenExpiry ? new Date(tokenExpiry).getTime() : undefined
  });

  oauth2Client.on('tokens', async (tokens) => {
    try {
      const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
      const next = existing?.settings ? { ...existing.settings } : {};
      if (persistSlot === 'youtube_manual') {
        next.youtube_manual = next.youtube_manual || {};
        next.youtube_manual.manual_access_token = tokens.access_token || next.youtube_manual.manual_access_token;
        next.youtube_manual.manual_refresh_token = tokens.refresh_token || next.youtube_manual.manual_refresh_token;
        next.youtube_manual.manual_token_expiry = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : next.youtube_manual.manual_token_expiry;
      } else {
        next.youtube = {
          ...next.youtube,
          access_token: tokens.access_token || next.youtube?.access_token,
          refresh_token: tokens.refresh_token || next.youtube?.refresh_token,
          token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : next.youtube?.token_expiry
        };
      }
      await ModuleSettings.update(businessId, MODULE_KEY, next);
    } catch (e) {
      console.error('[KidQuiz Publisher] Token refresh save failed:', e.message);
    }
  });

  return oauth2Client;
}

export async function publishKidQuizVideo(publish, render, project) {
  const publishId = publish.id;
  const businessId = publish.business_id;

  console.log(`[KidQuiz Publisher] Starting publish_id=${publishId}`);

  try {
    await supabaseClient
      .from('kidquiz_publishes')
      .update({ publish_status: 'UPLOADING', updated_at: new Date().toISOString() })
      .eq('id', publishId);

    // Download video from storage
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const { promisify } = await import('util');
    const { unlink } = await import('fs');
    const unlinkAsync = promisify(unlink);

    if (!render.output_url) throw new Error('Render has no output_url. Re-render first.');

    const tmpPath = join(tmpdir(), `kq-upload-${publishId}.mp4`);
    const resp = await axios.get(render.output_url.split('?')[0], { responseType: 'arraybuffer', timeout: 60000 });
    await fs.promises.writeFile(tmpPath, resp.data);

    const oauth2Client = await getYouTubeClient(businessId);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const title = (project.generated_title || project.topic || 'Kid Quiz').slice(0, 100);
    const description = (project.generated_description || `Quiz about ${project.topic}`).slice(0, 5000);
    const tags = Array.isArray(project.generated_hashtags) ? project.generated_hashtags.slice(0, 30) : [];

    const { Readable } = await import('stream');
    const videoBuffer = await fs.promises.readFile(tmpPath);
    const videoStream = Readable.from(videoBuffer);

    const uploadResp = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title, description, tags, categoryId: '27' },
        status: { privacyStatus: (project.privacy || 'PUBLIC').toLowerCase(), selfDeclaredMadeForKids: true }
      },
      media: { mimeType: 'video/mp4', body: videoStream }
    });

    const videoId = uploadResp.data.id;
    const youtubeUrl = `https://www.youtube.com/shorts/${videoId}`;

    await supabaseClient
      .from('kidquiz_publishes')
      .update({
        publish_status: 'PUBLISHED',
        youtube_video_id: videoId,
        youtube_url: youtubeUrl,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', publishId);

    await supabaseClient
      .from('kidquiz_projects')
      .update({ status: 'PUBLISHED', updated_at: new Date().toISOString() })
      .eq('id', project.id);

    try { await unlinkAsync(tmpPath); } catch (_) {}
    console.log(`[KidQuiz Publisher] Published videoId=${videoId}`);
    return { videoId, youtubeUrl };
  } catch (err) {
    const msg = err.message || '';
    const isInvalidClient = msg.includes('invalid_client') || err?.response?.data?.error === 'invalid_client';
    const userMessage = isInvalidClient
      ? 'YouTube OAuth client invalid. Go to Kid Quiz Studio → Settings and re-connect YouTube (same Client ID/Secret you used before, or add them in Upload OAuth app and connect).'
      : msg;
    console.error(`[KidQuiz Publisher] FAILED publish_id=${publishId}`, msg);
    await supabaseClient
      .from('kidquiz_publishes')
      .update({ publish_status: 'FAILED', error_message: userMessage, updated_at: new Date().toISOString() })
      .eq('id', publishId);
    await supabaseClient
      .from('kidquiz_projects')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', project.id);
    throw new Error(userMessage);
  }
}
