/**
 * Dad Joke Studio — YouTube upload / schedule (ModuleSettings dad-joke-studio).
 */
import { google } from 'googleapis';
import { createReadStream } from 'fs';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { dadjokeYoutubeCallbackUrl } from '../../config/public-urls.js';

const MODULE_KEY = 'dad-joke-studio';
const THUMB_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_DADJOKE_STUDIO_ASSETS || 'dadjoke-studio-assets';

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
    if (!accessToken) {
      throw new Error('YouTube not connected (manual OAuth). Connect in Dad Joke Studio → Upload & YouTube.');
    }
  } else {
    clientId = (yt?.client_id || '').trim();
    clientSecret = (yt?.client_secret || '').trim();
    if (!clientId || !clientSecret) {
      clientId = (process.env.KIDQUIZ_YOUTUBE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || '').trim() || undefined;
      clientSecret =
        (process.env.KIDQUIZ_YOUTUBE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET || '').trim() || undefined;
    }
    if (!yt?.access_token) {
      throw new Error('YouTube not connected for Dad Joke Studio. Open Upload & YouTube in the studio and connect.');
    }
    accessToken = yt.access_token;
    refreshToken = yt.refresh_token;
    tokenExpiry = yt.token_expiry;
    persistSlot = 'youtube';
  }

  if (!clientId || !clientSecret) {
    throw new Error('YouTube OAuth client not configured. Add Client ID and Secret in module settings, then connect YouTube.');
  }

  const redirectUri = dadjokeYoutubeCallbackUrl();

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: tokenExpiry ? new Date(tokenExpiry).getTime() : undefined,
  });

  oauth2Client.on('tokens', async (tokens) => {
    try {
      const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
      const next = existing?.settings ? { ...existing.settings } : {};
      if (persistSlot === 'youtube_manual') {
        next.youtube_manual = next.youtube_manual || {};
        next.youtube_manual.manual_access_token = tokens.access_token || next.youtube_manual.manual_access_token;
        next.youtube_manual.manual_refresh_token = tokens.refresh_token || next.youtube_manual.manual_refresh_token;
        next.youtube_manual.manual_token_expiry = tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : next.youtube_manual.manual_token_expiry;
      } else {
        next.youtube = {
          ...next.youtube,
          access_token: tokens.access_token || next.youtube?.access_token,
          refresh_token: tokens.refresh_token || next.youtube?.refresh_token,
          token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : next.youtube?.token_expiry,
        };
      }
      await ModuleSettings.update(businessId, MODULE_KEY, next);
    } catch (e) {
      console.error('[DadJokeStudio Publisher] Token refresh save failed:', e.message);
    }
  });

  return oauth2Client;
}

/**
 * @param {object} queueRow - dadjoke_studio_publish_queue
 * @param {object} renderRow - dadjoke_studio_rendered_outputs
 * @param {object} content - dadjoke_studio_generated_content
 */
export async function publishDadJokeStudioVideo(queueRow, renderRow, content) {
  const publishId = queueRow.id;
  const businessId = queueRow.business_id;

  console.log(`[DadJokeStudio Publisher] Starting publish_id=${publishId}`);

  try {
    await supabaseClient
      .from('dadjoke_studio_publish_queue')
      .update({ publish_status: 'UPLOADING', updated_at: new Date().toISOString() })
      .eq('id', publishId);

    await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update({ status: 'UPLOADING', updated_at: new Date().toISOString() })
      .eq('id', content.id);

    if (!renderRow.output_url) throw new Error('Render has no output_url.');

    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const { promisify } = await import('util');
    const { unlink } = await import('fs');
    const unlinkAsync = promisify(unlink);

    const tmpPath = join(tmpdir(), `djs-upload-${publishId}.mp4`);
    const resp = await axios.get(renderRow.output_url.split('?')[0], { responseType: 'arraybuffer', timeout: 120000 });
    await fs.promises.writeFile(tmpPath, resp.data);

    const oauth2Client = await getYouTubeClient(businessId);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const title = (queueRow.title || content.upload_title || content.title || 'Dad Joke Studio').slice(0, 100);
    const description = (queueRow.description || content.upload_description || '').slice(0, 5000);
    const tags = Array.isArray(queueRow.tags) ? queueRow.tags.slice(0, 30).map(String) : [];
    const categoryId = (queueRow.category_id || '23').slice(0, 8);
    const kids = !!queueRow.self_declared_made_for_kids;
    const scheduleAt = queueRow.schedule_publish_at_utc
      ? new Date(queueRow.schedule_publish_at_utc).toISOString()
      : null;

    const requestedPrivacy = (queueRow.privacy_status || 'public').toLowerCase();
    const statusBody = scheduleAt
      ? {
          privacyStatus: 'private',
          publishAt: scheduleAt,
          selfDeclaredMadeForKids: kids,
        }
      : {
          privacyStatus: requestedPrivacy === 'unlisted' ? 'unlisted' : requestedPrivacy === 'private' ? 'private' : 'public',
          selfDeclaredMadeForKids: kids,
        };

    const { Readable } = await import('stream');
    const videoBuffer = await fs.promises.readFile(tmpPath);
    const videoStream = Readable.from(videoBuffer);

    const uploadResp = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title, description, tags, categoryId },
        status: statusBody,
      },
      media: { mimeType: 'video/mp4', body: videoStream },
    });

    const videoId = uploadResp.data.id;
    const isShorts = content.content_type === 'shorts';
    const youtubeUrl = isShorts
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`;

    if (queueRow.thumbnail_storage_path) {
      try {
        const { data: thumbFile } = await supabaseClient.storage
          .from(THUMB_BUCKET)
          .download(queueRow.thumbnail_storage_path);
        if (thumbFile) {
          const thumbTmp = join(tmpdir(), `djs-thumb-${publishId}.jpg`);
          const buf = Buffer.from(await thumbFile.arrayBuffer());
          await fs.promises.writeFile(thumbTmp, buf);
          await youtube.thumbnails.set({
            videoId,
            media: { body: createReadStream(thumbTmp) },
          });
          try { await unlinkAsync(thumbTmp); } catch (_) {}
        }
      } catch (te) {
        console.warn('[DadJokeStudio Publisher] Thumbnail upload skipped:', te.message);
      }
    }

    const pubStatus = scheduleAt ? 'SCHEDULED' : 'PUBLISHED';
    const now = new Date().toISOString();

    await supabaseClient
      .from('dadjoke_studio_publish_queue')
      .update({
        publish_status: pubStatus,
        youtube_video_id: videoId,
        youtube_url: youtubeUrl,
        published_at: scheduleAt ? null : now,
        updated_at: now,
      })
      .eq('id', publishId);

    await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update({
        status: scheduleAt ? 'SCHEDULED' : 'PUBLISHED',
        updated_at: now,
      })
      .eq('id', content.id);

    try { await unlinkAsync(tmpPath); } catch (_) {}
    console.log(`[DadJokeStudio Publisher] Done videoId=${videoId} scheduled=${!!scheduleAt}`);
    return { videoId, youtubeUrl, scheduled: !!scheduleAt };
  } catch (err) {
    const msg = err.message || '';
    const userMessage = msg.includes('invalid_client')
      ? 'YouTube OAuth client invalid. Re-connect YouTube in Dad Joke Studio (same OAuth app as the rest of KiddConnect).'
      : msg;
    console.error(`[DadJokeStudio Publisher] FAILED publish_id=${publishId}`, msg);
    await supabaseClient
      .from('dadjoke_studio_publish_queue')
      .update({ publish_status: 'FAILED', error_message: userMessage, updated_at: new Date().toISOString() })
      .eq('id', publishId);
    await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update({ status: 'RENDERED', updated_at: new Date().toISOString() })
      .eq('id', content.id);
    throw new Error(userMessage);
  }
}
