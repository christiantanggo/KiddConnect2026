/**
 * Kid Quiz Studio — YouTube Publisher
 * Uploads rendered mp4 to YouTube using stored OAuth tokens.
 * Completely separate from orbix-network publisher.
 */
import { google } from 'googleapis';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const MODULE_KEY = 'kidquiz';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_KIDQUIZ_RENDERS || 'kidquiz-videos';

async function getYouTubeClient(businessId) {
  const hasOAuth = process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI;
  if (!hasOAuth) throw new Error('YouTube OAuth not configured on this server.');

  const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const yt = moduleSettings?.settings?.youtube;
  if (!yt?.access_token) {
    throw new Error('YouTube not connected for Kid Quiz Studio. Go to Kid Quiz Studio → Settings and connect YouTube.');
  }

  const raw = process.env.YOUTUBE_REDIRECT_URI || '';
  const kidquizRedirect = raw.replace(/orbix-network\/youtube\/callback/, 'kidquiz/youtube/callback');
  const redirectUri = kidquizRedirect.startsWith('http') ? kidquizRedirect : `https://${kidquizRedirect}`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    redirectUri
  );

  oauth2Client.setCredentials({
    access_token: yt.access_token,
    refresh_token: yt.refresh_token,
    expiry_date: yt.token_expiry ? new Date(yt.token_expiry).getTime() : undefined
  });

  // Auto-refresh tokens and persist
  oauth2Client.on('tokens', async (tokens) => {
    try {
      const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
      const settings = existing?.settings ? { ...existing.settings } : {};
      settings.youtube = {
        ...settings.youtube,
        access_token: tokens.access_token || settings.youtube?.access_token,
        refresh_token: tokens.refresh_token || settings.youtube?.refresh_token,
        token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : settings.youtube?.token_expiry
      };
      await ModuleSettings.update(businessId, MODULE_KEY, settings);
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
    console.error(`[KidQuiz Publisher] FAILED publish_id=${publishId}`, err.message);
    await supabaseClient
      .from('kidquiz_publishes')
      .update({ publish_status: 'FAILED', error_message: err.message, updated_at: new Date().toISOString() })
      .eq('id', publishId);
    await supabaseClient
      .from('kidquiz_projects')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', project.id);
    throw err;
  }
}
