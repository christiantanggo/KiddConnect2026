/**
 * Movie Review Studio — YouTube Publisher
 */
import { google } from 'googleapis';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

const MODULE_KEY = 'movie-review';

async function getYouTubeClient(businessId) {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REDIRECT_URI) {
    throw new Error('YouTube OAuth not configured on this server.');
  }
  const ms = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const yt = ms?.settings?.youtube;
  if (!yt?.access_token) {
    throw new Error('YouTube not connected for Movie Review Studio. Go to Settings and connect YouTube.');
  }

  const raw = process.env.YOUTUBE_REDIRECT_URI || '';
  const redirectUri = raw.startsWith('http') ? raw : `https://${raw}`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    redirectUri
  );
  oauth2Client.setCredentials({
    access_token: yt.access_token,
    refresh_token: yt.refresh_token,
    expiry_date: yt.token_expiry ? new Date(yt.token_expiry).getTime() : undefined,
  });

  // Persist refreshed tokens
  oauth2Client.on('tokens', async (tokens) => {
    try {
      const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
      const settings = existing?.settings ? { ...existing.settings } : {};
      settings.youtube = {
        ...settings.youtube,
        access_token: tokens.access_token || settings.youtube?.access_token,
        refresh_token: tokens.refresh_token || settings.youtube?.refresh_token,
        token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : settings.youtube?.token_expiry,
      };
      await ModuleSettings.update(businessId, MODULE_KEY, settings);
    } catch (e) {
      console.error('[MovieReview Publisher] Token refresh save failed:', e.message);
    }
  });

  return oauth2Client;
}

export async function publishMovieReview(project, businessId) {
  const projectId = project.id;
  console.log(`[MovieReview Publisher] Starting projectId=${projectId}`);

  try {
    if (!project.render_url) throw new Error('No render URL. Render the video first.');

    // Download video
    const resp = await fetch(project.render_url.split('?')[0]);
    if (!resp.ok) throw new Error(`Failed to download render: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());

    const { writeFile, unlink } = await import('fs');
    const { promisify } = await import('util');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const { randomUUID } = await import('crypto');
    const writeAsync = promisify(writeFile);
    const unlinkAsync = promisify(unlink);

    const tmpPath = join(tmpdir(), `mr-upload-${randomUUID()}.mp4`);
    await writeAsync(tmpPath, buf);

    const oauth2Client = await getYouTubeClient(businessId);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

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
    console.error(`[MovieReview Publisher] FAILED projectId=${projectId}:`, err.message);
    await supabaseClient
      .from('movie_review_projects')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', projectId);
    throw err;
  }
}
