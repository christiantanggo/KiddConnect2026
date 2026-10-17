/**
 * YouTube connect and upload for Willie & Billy.
 * Uses the Google OAuth app already saved for this studio (Dad Joke Studio)
 * and the Dad Joke redirect URL, which Google already allows.
 */
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import axios from 'axios';
import { google } from 'googleapis';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { dadjokeYoutubeCallbackUrl, getFrontendPublicBaseUrl } from '../../config/public-urls.js';

export const WILLIE_GOOGLE_ACCOUNT = 'christian.fournierattanggo@gmail.com';
export const WILLIE_CHANNEL_HANDLE = 'whereswillieandbilly';
const MODULE_KEY = 'willie-billy';

export function willieSettingsPath() {
  return `${getFrontendPublicBaseUrl()}/dashboard/v2/modules/willie-billy/settings`;
}

export function willieRedirectUri() {
  return dadjokeYoutubeCallbackUrl();
}

async function oauthApp(businessId) {
  const willie = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const saved = willie?.settings?.youtube || {};
  let clientId = (saved.client_id || '').trim();
  let clientSecret = (saved.client_secret || '').trim();

  if (!clientId || !clientSecret) {
    const { data } = await supabaseClient
      .from('module_settings')
      .select('settings')
      .eq('module_key', 'dad-joke-studio');
    const match = (data || []).find((row) => row.settings?.youtube?.client_id && row.settings?.youtube?.client_secret);
    if (match) {
      clientId = clientId || String(match.settings.youtube.client_id).trim();
      clientSecret = clientSecret || String(match.settings.youtube.client_secret).trim();
    }
  }

  clientId = clientId || (process.env.KIDQUIZ_YOUTUBE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || '').trim();
  clientSecret = clientSecret || (process.env.KIDQUIZ_YOUTUBE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET || '').trim();
  return { clientId, clientSecret };
}

export async function willieYouTubeAuthUrl(businessId) {
  const { clientId, clientSecret } = await oauthApp(businessId);
  if (!clientId || !clientSecret) {
    const err = new Error('YouTube OAuth is not configured on the server yet.');
    err.status = 400;
    throw err;
  }
  const redirectUri = willieRedirectUri();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    state: `${businessId}:willie-billy`,
    prompt: 'select_account consent',
  });
  return { url, redirect_uri: redirectUri, login_hint: WILLIE_GOOGLE_ACCOUNT };
}

export async function willieYouTubeStatus(businessId) {
  const row = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const yt = row?.settings?.youtube || {};
  return {
    connected: !!yt.access_token,
    channel_title: yt.channel_title || null,
    channel_handle: yt.channel_handle || null,
    account: WILLIE_GOOGLE_ACCOUNT,
    expected_handle: `@${WILLIE_CHANNEL_HANDLE}`,
    redirect_uri: willieRedirectUri(),
    last_attempt: yt.last_attempt || null,
  };
}

export async function disconnectWillieYouTube(businessId) {
  const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const settings = existing?.settings ? { ...existing.settings } : {};
  delete settings.youtube;
  await ModuleSettings.update(businessId, MODULE_KEY, settings);
  return willieYouTubeStatus(businessId);
}

async function rememberAttempt(businessId, attempt) {
  const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const settings = existing?.settings ? { ...existing.settings } : {};
  settings.youtube = { ...(settings.youtube || {}), last_attempt: attempt };
  await ModuleSettings.update(businessId, MODULE_KEY, settings);
}

export async function completeWillieYouTubeConnect(code, businessId) {
  const back = willieSettingsPath();
  const { clientId, clientSecret } = await oauthApp(businessId);
  if (!clientId || !clientSecret) {
    return { redirect: `${back}?error=youtube_not_configured` };
  }
  const redirectUri = willieRedirectUri();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  let tokens;
  try {
    const result = await oauth2Client.getToken(code);
    tokens = result.tokens;
  } catch (err) {
    const data = err?.response?.data;
    console.error('[WillieBilly YouTube] getToken failed:', data?.error, data?.error_description);
    if (data?.error === 'invalid_grant') return { redirect: `${back}?error=invalid_grant` };
    return { redirect: `${back}?error=youtube_oauth_error` };
  }

  oauth2Client.setCredentials(tokens);
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const channelResponse = await youtube.channels.list({ part: ['snippet'], mine: true });
  const channel = channelResponse.data.items?.[0];
  console.log('[WillieBilly YouTube] Google returned', channel?.snippet?.title || '(none)', channel?.snippet?.customUrl || '(no handle)', channel?.id || '');
  if (!channel) {
    await rememberAttempt(businessId, { reason: 'no_channel', at: new Date().toISOString() });
    return { redirect: `${back}?error=no_channel_found` };
  }

  const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const settings = existing?.settings ? { ...existing.settings } : {};
  settings.youtube = {
    ...(settings.youtube || {}),
    channel_id: channel.id,
    channel_title: channel.snippet?.title || '',
    channel_handle: channel.snippet?.customUrl || `@${WILLIE_CHANNEL_HANDLE}`,
    account: WILLIE_GOOGLE_ACCOUNT,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || settings.youtube?.refresh_token,
    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    client_id: clientId,
    client_secret: clientSecret,
  };
  await ModuleSettings.update(businessId, MODULE_KEY, settings);
  console.log('[WillieBilly YouTube] Connected', channel.snippet?.customUrl || channel.id);
  return { redirect: `${back}?youtube_connected=true` };
}

async function getClient(businessId) {
  const row = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
  const yt = row?.settings?.youtube || {};
  if (!yt.access_token) {
    const err = new Error('Connect YouTube first.');
    err.status = 400;
    throw err;
  }
  const { clientId, clientSecret } = await oauthApp(businessId);
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, willieRedirectUri());
  oauth2Client.setCredentials({
    access_token: yt.access_token,
    refresh_token: yt.refresh_token,
    expiry_date: yt.token_expiry ? new Date(yt.token_expiry).getTime() : undefined,
  });
  oauth2Client.on('tokens', async (tokens) => {
    const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = existing?.settings ? { ...existing.settings } : {};
    settings.youtube = {
      ...(settings.youtube || {}),
      access_token: tokens.access_token || settings.youtube?.access_token,
      refresh_token: tokens.refresh_token || settings.youtube?.refresh_token,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : settings.youtube?.token_expiry,
    };
    await ModuleSettings.update(businessId, MODULE_KEY, settings);
  });
  return oauth2Client;
}

export async function uploadWillieRender(businessId, renderId) {
  const { data: row, error } = await supabaseClient
    .from('willie_billy_renders')
    .select('*')
    .eq('id', renderId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) throw error;
  if (!row) {
    const err = new Error('That video was not found.');
    err.status = 404;
    throw err;
  }
  if (row.youtube_url) return row;
  if (row.status !== 'ready' || !row.video_url) {
    const err = new Error('The video is not ready to post.');
    err.status = 400;
    throw err;
  }

  const tmpPath = join(tmpdir(), `wb-yt-${renderId}.mp4`);
  const resp = await axios.get(String(row.video_url).split('?')[0], { responseType: 'arraybuffer', timeout: 120000 });
  const { writeFile } = await import('fs/promises');
  await writeFile(tmpPath, resp.data);
  try {
    const auth = await getClient(businessId);
    const youtube = google.youtube({ version: 'v3', auth });
    const title = String(row.youtube_title || row.title || 'Willie & Billy').slice(0, 100);
    const description = String(row.script || title).slice(0, 4500);
    const uploadResp = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          tags: ['Willie and Billy', 'WheresWillieAndBilly', 'hide and seek'],
          categoryId: '24',
        },
        status: {
          privacyStatus: 'unlisted',
          selfDeclaredMadeForKids: false,
        },
      },
      media: { mimeType: 'video/mp4', body: createReadStream(tmpPath) },
    });
    const videoId = uploadResp.data.id;
    const youtubeUrl = row.kind === 'short'
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`;
    const { data: updated, error: updateError } = await supabaseClient
      .from('willie_billy_renders')
      .update({
        youtube_video_id: videoId,
        youtube_url: youtubeUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single();
    if (updateError) throw updateError;
    return updated;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
