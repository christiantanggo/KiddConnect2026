/**
 * Orbix Network YouTube Publisher Service
 * Publishes videos to YouTube Shorts via YouTube Data API v3
 */

import { google } from 'googleapis';
import axios from 'axios';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { writeProgressLog } from '../../utils/crash-and-progress-log.js';
import { defaultOrbixYoutubeCallbackUrl } from '../../config/public-urls.js';

/** Error code used when YouTube upload should be skipped (env missing or not connected). Callers must treat as non-fatal. */
export const SKIP_YOUTUBE_UPLOAD_CODE = 'SKIP_YOUTUBE_UPLOAD';

/**
 * Get YouTube credentials for a business (and optionally a specific Orbix channel).
 * Uses settings.youtube_by_channel[orbixChannelId] when orbixChannelId is set and present; else settings.youtube (legacy).
 * @param {string} businessId - Business ID
 * @param {string} [orbixChannelId] - Orbix channel ID; when set, use that channel's YouTube connection
 * @returns {Promise<Object>} OAuth2 client
 */
/**
 * Resolve OAuth client ID and secret for the requested slot only. No fallbacks.
 * - For a channel: manual = only manual_client_id/secret; auto = only client_id/secret. Never use the other slot or env.
 * - Legacy (no channel): use env only.
 */
export function resolveOAuthCredentials(channelEntry, envClientId, envClientSecret, usage = 'auto') {
  if (channelEntry) {
    if (usage === 'manual') {
      return {
        clientId: (channelEntry.manual_client_id || '').trim(),
        clientSecret: (channelEntry.manual_client_secret || '').trim()
      };
    }
    return {
      clientId: (channelEntry.client_id || '').trim(),
      clientSecret: (channelEntry.client_secret || '').trim()
    };
  }
  const clientId = (envClientId || '').trim();
  const clientSecret = (envClientSecret || '').trim();
  return { clientId, clientSecret };
}

/**
 * Build a single yt-like object from channel entry for either auto or manual slot.
 */
function getYtFromChannelEntry(entry, useManual) {
  if (!entry) return null;
  if (useManual && entry.manual_access_token) {
    return {
      access_token: entry.manual_access_token,
      refresh_token: entry.manual_refresh_token,
      channel_id: entry.manual_channel_id,
      channel_title: entry.manual_channel_title,
      token_expiry: entry.manual_token_expiry,
      client_id: entry.manual_client_id,
      client_secret: entry.manual_client_secret
    };
  }
  if (entry.access_token) {
    return {
      access_token: entry.access_token,
      refresh_token: entry.refresh_token,
      channel_id: entry.channel_id,
      channel_title: entry.channel_title,
      token_expiry: entry.token_expiry,
      client_id: entry.client_id,
      client_secret: entry.client_secret
    };
  }
  return null;
}

async function getYouTubeClient(businessId, orbixChannelId = null, options = {}) {
  const useManual = !!options.useManual;
  try {
    writeProgressLog('YT_GETCLIENT_START', { businessId, orbixChannelId: orbixChannelId || 'legacy', useManual });
    console.log('[YouTube Publisher] getYouTubeClient businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'legacy', 'useManual=', useManual);

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    writeProgressLog('YT_GETCLIENT_SETTINGS_DONE', { businessId, hasSettings: !!moduleSettings });
    if (!moduleSettings) {
      console.error('[YouTube Publisher] No module settings found for businessId=', businessId, 'module=orbix-network');
      const err = new Error('YouTube not connected. Please connect your YouTube account in settings.');
      err.code = SKIP_YOUTUBE_UPLOAD_CODE;
      throw err;
    }
    const settings = moduleSettings.settings || {};
    const byChannel = settings.youtube_by_channel || {};
    const channelIds = Object.keys(byChannel || {});
    console.log('[YouTube Publisher] orbixChannelId=', orbixChannelId || 'legacy', 'stored channel keys=', channelIds.join(',') || 'none');

    let yt = null;
    let usePerChannel = false;
    let slotManual = false;
    if (orbixChannelId) {
      const entry = byChannel[orbixChannelId];
      // Use only the requested slot: manual upload = manual tab credentials only; auto = auto tab only. No cross-fallback.
      if (useManual) {
        if (entry?.manual_access_token) {
          yt = getYtFromChannelEntry(entry, true);
          usePerChannel = true;
          slotManual = true;
          writeProgressLog('YT_OAUTH_SLOT', { slot: 'MANUAL', orbixChannelId, youtube_channel_id: yt?.channel_id || null });
          console.log('[YouTube Publisher] Using MANUAL OAuth for orbixChannelId=', orbixChannelId, 'youtube_channel_id=', yt?.channel_id || 'n/a', '(Force Upload path)');
        } else {
          console.error('[YouTube Publisher] Manual upload requested but channel has no manual OAuth. Connect YouTube in the Manual tab for this channel. orbixChannelId=', orbixChannelId);
        }
      } else {
        if (entry?.access_token) {
          yt = getYtFromChannelEntry(entry, false);
          usePerChannel = true;
          writeProgressLog('YT_OAUTH_SLOT', { slot: 'AUTO', orbixChannelId, youtube_channel_id: yt?.channel_id || null });
          console.log('[YouTube Publisher] Using AUTO OAuth for orbixChannelId=', orbixChannelId, 'youtube_channel_id=', yt?.channel_id || 'n/a', '(scheduled/pipeline path)');
        } else {
          console.error('[YouTube Publisher] Auto upload requested but channel has no auto OAuth. Connect YouTube in the Auto tab for this channel. orbixChannelId=', orbixChannelId);
        }
      }
    }
    if (!yt && !orbixChannelId && settings.youtube?.access_token) {
      yt = settings.youtube;
      console.log('[YouTube Publisher] Using legacy settings.youtube youtube_channel_id=', yt?.channel_id || 'n/a');
    }
    if (!yt || !yt.access_token) {
      const slotName = useManual ? 'Manual' : 'Auto';
      const msg = orbixChannelId
        ? `YouTube not connected for this channel's ${slotName} upload. In Orbix Network → Settings, connect YouTube in the ${slotName} tab for this channel.`
        : 'YouTube not connected. Please connect your YouTube account in settings.';
      if (yt?.channel_id) {
        const err = new Error('YouTube was connected but credentials are missing or expired. Go to Orbix Network → Settings, disconnect YouTube for this channel, then connect again.');
        err.code = SKIP_YOUTUBE_UPLOAD_CODE;
        throw err;
      }
      const err = new Error(msg);
      err.code = SKIP_YOUTUBE_UPLOAD_CODE;
      throw err;
    }
    if (!yt.refresh_token) {
      console.warn('[YouTube Publisher] No refresh_token for businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'n/a');
    }

    const { clientId, clientSecret } = resolveOAuthCredentials(
      orbixChannelId ? byChannel[orbixChannelId] : null,
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      slotManual ? 'manual' : 'auto'
    );
    if (!clientId || !clientSecret) {
      const slotName = useManual ? 'Manual' : 'Auto';
      const err = new Error(`OAuth not configured for this channel's ${slotName} upload. In Settings, add the Client ID and Secret in the ${slotName} tab for this channel.`);
      err.code = SKIP_YOUTUBE_UPLOAD_CODE;
      throw err;
    }
    let raw = (process.env.YOUTUBE_REDIRECT_URI || '').trim();
    let redirectUri = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : (usePerChannel ? defaultOrbixYoutubeCallbackUrl() : ''));
    if (usePerChannel && orbixChannelId) {
      const { getRiddleYoutubeRedirectUri } = await import('../../routes/v2/riddle-youtube-callback.js');
      redirectUri = getRiddleYoutubeRedirectUri();
    }
    if (!redirectUri) {
      const err = new Error('YouTube OAuth not configured (missing YOUTUBE_REDIRECT_URI). Set it in .env or Railway Environment.');
      err.code = SKIP_YOUTUBE_UPLOAD_CODE;
      throw err;
    }
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const expiryDate = yt.token_expiry ? new Date(yt.token_expiry).getTime() : null;
    oauth2Client.setCredentials({
      access_token: yt.access_token,
      refresh_token: yt.refresh_token,
      ...(expiryDate ? { expiry_date: expiryDate } : {})
    });

    // Proactively refresh the access token if it is expired or expiring within 2 minutes.
    // This prevents silent 401s when the googleapis library does not auto-refresh (e.g. expiry_date missing).
    const nowMs = Date.now();
    const isExpiredOrMissing = !expiryDate || expiryDate < nowMs + 2 * 60 * 1000;
    if (isExpiredOrMissing && yt.refresh_token) {
      try {
        console.log('[YouTube Publisher] Access token expired/missing expiry — proactively refreshing for businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'legacy');
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        // Persist the new access token immediately so it is available for future calls
        const updatedSettings2 = { ...moduleSettings.settings };
        const existingEntry = usePerChannel ? byChannel[orbixChannelId] : updatedSettings2.youtube;
        const updatedYt2 = slotManual
          ? { ...existingEntry, manual_access_token: credentials.access_token, ...(credentials.expiry_date ? { manual_token_expiry: new Date(credentials.expiry_date).toISOString() } : {}) }
          : { ...existingEntry, access_token: credentials.access_token, ...(credentials.expiry_date ? { token_expiry: new Date(credentials.expiry_date).toISOString() } : {}) };
        if (usePerChannel) {
          updatedSettings2.youtube_by_channel = { ...byChannel, [orbixChannelId]: updatedYt2 };
        } else {
          updatedSettings2.youtube = updatedYt2;
        }
        await ModuleSettings.update(businessId, 'orbix-network', updatedSettings2);
        console.log('[YouTube Publisher] Proactive token refresh SUCCESS for businessId=', businessId);
      } catch (refreshErr) {
        console.error('[YouTube Publisher] Proactive token refresh FAILED for businessId=', businessId, 'error=', refreshErr.message);
        // If refresh explicitly fails with invalid_grant the token is revoked — surface a clear error
        if (refreshErr.message?.includes('invalid_grant') || refreshErr.message?.includes('Token has been expired or revoked')) {
          const err = new Error('YouTube token has been revoked or is no longer valid. Go to Orbix Network → Settings, disconnect YouTube for this channel, then connect again.');
          err.code = SKIP_YOUTUBE_UPLOAD_CODE;
          throw err;
        }
        // Otherwise fall through and let the API call attempt with the existing token
        console.warn('[YouTube Publisher] Continuing with existing token despite refresh failure');
      }
    } else if (isExpiredOrMissing && !yt.refresh_token) {
      console.error('[YouTube Publisher] Access token expired and NO refresh_token available — will likely get 401. businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'legacy');
    }

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        console.log('[YouTube Publisher] Token refreshed for businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'legacy', 'slotManual=', slotManual);
        const updatedSettings = { ...moduleSettings.settings };
        const existingEntry = usePerChannel ? byChannel[orbixChannelId] : updatedSettings.youtube;
        const updatedYt = slotManual
          ? { ...existingEntry, manual_access_token: tokens.access_token, ...(tokens.expiry_date ? { manual_token_expiry: new Date(tokens.expiry_date).toISOString() } : {}) }
          : { ...existingEntry, access_token: tokens.access_token, ...(tokens.expiry_date ? { token_expiry: new Date(tokens.expiry_date).toISOString() } : {}) };
        if (usePerChannel) {
          updatedSettings.youtube_by_channel = { ...byChannel, [orbixChannelId]: updatedYt };
        } else {
          updatedSettings.youtube = updatedYt;
        }
        await ModuleSettings.update(businessId, 'orbix-network', updatedSettings);
      }
    });

    writeProgressLog('YT_GETCLIENT_READY', { businessId });
    console.log('[YouTube Publisher] OAuth client created for businessId=', businessId, 'youtube_channel_id=', yt.channel_id || 'n/a');
    return oauth2Client;
  } catch (error) {
    console.error('[YouTube Publisher] getYouTubeClient error:', error.message, 'businessId=', businessId, 'orbixChannelId=', orbixChannelId);
    throw error;
  }
}

/**
 * Download video from URL to local file
 * @param {string} videoUrl - URL to video file
 * @returns {Promise<string>} Path to downloaded video file
 */
async function downloadVideo(videoUrl) {
  try {
    const fs = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    
    const response = await axios.get(videoUrl, {
      responseType: 'stream'
    });
    
    const videoPath = join(tmpdir(), `orbix-youtube-upload-${Date.now()}.mp4`);
    const writer = fs.default.createWriteStream(videoPath);
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(videoPath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('[YouTube Publisher] Error downloading video:', error);
    throw error;
  }
}

/**
 * Check if the given value is a URL (http/https). Otherwise treat as local file path.
 * @param {string} videoUrlOrPath - URL or absolute/local path
 * @returns {boolean}
 */
function isVideoUrl(videoUrlOrPath) {
  return typeof videoUrlOrPath === 'string' && (videoUrlOrPath.startsWith('http://') || videoUrlOrPath.startsWith('https://'));
}

/**
 * Publish video to YouTube Shorts
 * @param {string} businessId - Business ID
 * @param {string} renderId - Render ID
 * @param {string} videoUrlOrPath - URL to video file (Supabase Storage) or local file path (e.g. from render pipeline)
 * @param {Object} metadata - Video metadata (title, description, tags array)
 * @param {{ orbixChannelId?: string, useManual?: boolean }} [options] - orbixChannelId = channel for upload; useManual = use manual OAuth (Force Upload) so auto and manual can be separate
 * @returns {Promise<Object>} YouTube video information { videoId, url, title }
 */
export async function publishVideo(businessId, renderId, videoUrlOrPath, metadata, options = {}) {
  const fs = await import('fs');
  let videoPath = null;
  let shouldUnlink = false;
  const orbixChannelId = options.orbixChannelId || null;

  try {
    const isUrl = isVideoUrl(videoUrlOrPath);
    writeProgressLog('YT_PUBLISH_START', { renderId, businessId, inputType: isUrl ? 'url' : 'path', useManual: options.useManual });
    console.log('[YouTube Publisher] publishVideo start', { businessId, renderId, orbixChannelId, useManual: options.useManual, title: metadata?.title, inputType: isUrl ? 'url' : 'path' });

    const auth = await getYouTubeClient(businessId, orbixChannelId, { useManual: options.useManual });
    writeProgressLog('YT_PUBLISH_AUTH_DONE', { renderId });
    const youtube = google.youtube({ version: 'v3', auth });

    if (isUrl) {
      console.log('[YouTube Publisher] Downloading video from URL...');
      videoPath = await downloadVideo(videoUrlOrPath);
      shouldUnlink = true;
      console.log('[YouTube Publisher] Downloaded to', videoPath);
    } else {
      videoPath = videoUrlOrPath;
      if (!fs.default.existsSync(videoPath)) {
        console.error('[YouTube Publisher] Video file not found:', videoPath);
        throw new Error(`Video file not found: ${videoPath}`);
      }
      const stat = fs.default.statSync(videoPath);
      console.log('[YouTube Publisher] Using local file size=', stat.size, 'bytes');
    }

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    const visibility = moduleSettings?.settings?.publishing?.youtube_visibility || 'public';
    writeProgressLog('YT_PUBLISH_UPLOAD_START', { renderId, visibility });
    // Log full metadata sent so removals can be correlated (YouTube removes are policy-side, not from our app)
    const snippetLog = {
      title: metadata.title || '(empty)',
      titleLength: (metadata.title || '').length,
      descriptionLength: (metadata.description || '').length,
      tagCount: (metadata.tags || []).length,
      tags: (metadata.tags || []).slice(0, 5),
      visibility,
      categoryId: '24'
    };
    console.log('[YouTube Publisher] videos.insert request', snippetLog);
    writeProgressLog('YT_PUBLISH_METADATA', { renderId, ...snippetLog });

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: metadata.title || 'Orbix Short',
          description: metadata.description || '',
          tags: metadata.tags || [],
          categoryId: '24' // News & Politics category
        },
        status: {
          privacyStatus: visibility, // public, unlisted, or private
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.default.createReadStream(videoPath)
      }
    });

    const videoId = response.data.id;
    writeProgressLog('YT_PUBLISH_UPLOAD_DONE', { renderId, videoId });

    if (shouldUnlink) {
      await fs.default.promises.unlink(videoPath).catch(() => {});
    }

    console.log('[YouTube Publisher] Video published successfully renderId=', renderId, 'videoId=', videoId, 'url=https://www.youtube.com/watch?v=' + videoId);

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: metadata.title
    };
  } catch (error) {
    if (videoPath && shouldUnlink) {
      try {
        await fs.default.promises.unlink(videoPath);
      } catch (unlinkError) {
        // Ignore cleanup errors
      }
    }
    const responseData = error.response?.data;
    const status = error.response?.status;
    const apiError = responseData?.error;
    const firstReason = apiError?.errors?.[0]?.reason || apiError?.errors?.[0]?.domain || '';
    console.error('[YouTube Publisher] upload failed status=', status, 'reason=', firstReason, 'message=', (responseData?.error?.message || error.message || '').slice(0, 120));
    const googleMsg = (responseData?.error?.message || error.message || '').toLowerCase();
    const isQuotaExceeded = apiError?.errors?.some(e => e.reason === 'quotaExceeded' || e.domain === 'youtube.quota');
    // 403 or 400 "API not enabled" = YouTube Data API v3 not enabled in this Google Cloud project (not auth, not quota)
    const isApiNotEnabled = (status === 403 || status === 400) && (
      apiError?.errors?.some(e => e.reason === 'accessNotConfigured')
      || googleMsg.includes('has not been used') || googleMsg.includes('is disabled')
      || googleMsg.includes('not been used in project') || googleMsg.includes('access not configured')
    );
    // Do not treat 403 quotaExceeded or API-not-enabled as auth
    const isAuthError = !isQuotaExceeded && !isApiNotEnabled && (
      status === 401 || status === 403
      || apiError?.code === 401 || apiError?.code === 403
      || error.message?.includes('invalid_grant')
      || (apiError?.errors && apiError.errors.some(e => e.reason === 'authError' || e.reason === 'forbidden'))
    );

    console.error('[YouTube Publisher] publishVideo failed', {
      renderId,
      businessId,
      message: error.message,
      code: error.code,
      status,
      responseData: responseData ? JSON.stringify(responseData) : undefined
    });
    if (responseData?.error?.message) {
      console.error('[YouTube Publisher] YouTube API error message:', responseData.error.message);
      if (responseData.error.errors?.length) {
        responseData.error.errors.forEach((e, i) => {
          console.error('[YouTube Publisher] YouTube API error[' + i + ']:', e.reason, e.message);
        });
      }
    }

    if (isQuotaExceeded) {
      console.error('[YouTube Publisher] YouTube quota exceeded — upload blocked until quota resets (not a credentials issue). User can use Force upload later.');
    }

    if (isApiNotEnabled) {
      console.error('[YouTube Publisher] API NOT ENABLED — YouTube Data API v3 is not enabled for this OAuth project.');
      const err = new Error('YouTube Data API v3 is not enabled for this Google Cloud project. In Google Cloud Console → APIs & Services → Enable APIs, enable "YouTube Data API v3" for the project that owns this OAuth client.');
      err.code = SKIP_YOUTUBE_UPLOAD_CODE;
      throw err;
    }

    if (isAuthError) {
      const googleReasons = responseData?.error?.errors?.map(e => e.reason).join(', ') || '';
      console.error('[YouTube Publisher] AUTH ERROR details — googleMsg:', responseData?.error?.message || error.message, 'reasons:', googleReasons || 'none');
      const err = new Error(`YouTube credentials invalid or expired (${responseData?.error?.message || error.message || 'auth error'}). Go to Orbix Network → Settings, disconnect YouTube for this channel, then connect again.`);
      err.code = SKIP_YOUTUBE_UPLOAD_CODE;
      throw err;
    }

    // uploadLimitExceeded: YouTube's per-CHANNEL (per Google/YouTube account) daily limit — NOT API quota. Same channel in Auto + Manual = one shared limit.
    const isUploadLimitExceeded = firstReason === 'uploadLimitExceeded' || googleMsg.includes('exceeded the number of videos');
    if (isUploadLimitExceeded) {
      console.error('[YouTube Publisher] uploadLimitExceeded — orbixChannelId=', orbixChannelId || 'legacy', 'reason=', firstReason, '(YouTube channel/account limit, not API project quota)');
      const err = new Error(
        'YouTube says this channel/account has reached its daily upload limit. ' +
        'This limit is per YouTube channel (the Google account you connected), not per API project. ' +
        'If the same Google account is connected in both the Auto and Manual tabs, it is the same channel — one shared limit. ' +
        'Limits often reset at midnight Pacific Time. Try again later or connect a different YouTube channel (different Google account) in the Manual tab for a separate limit.'
      );
      err.response = error.response;
      throw err;
    }

    throw error;
  }
}

/**
 * Post a top-level comment on a YouTube video. Uses same OAuth as upload (for dad joke: same channel).
 * YouTube Data API v3 does not support pinning comments; the first comment by the channel will appear at top by time.
 * @param {string} businessId - Business ID
 * @param {string} videoId - YouTube video ID
 * @param {string} text - Comment text
 * @param {{ orbixChannelId?: string, useManual?: boolean }} [options] - Same as publishVideo for consistent channel
 * @returns {Promise<Object>} Comment resource
 */
export async function insertComment(businessId, videoId, text, options = {}) {
  const orbixChannelId = options.orbixChannelId || null;
  try {
    const auth = await getYouTubeClient(businessId, orbixChannelId, { useManual: options.useManual });
    const youtube = google.youtube({ version: 'v3', auth });
    const response = await youtube.commentThreads.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: {
              textOriginal: (text || '').trim().slice(0, 10000)
            }
          }
        }
      }
    });
    console.log('[YouTube Publisher] Comment posted videoId=', videoId, 'commentId=', response.data?.id);
    return response.data;
  } catch (error) {
    console.error('[YouTube Publisher] insertComment failed', { videoId, message: error.message });
    throw error;
  }
}

/**
 * Upload a caption track (SRT) to an existing YouTube video.
 * @param {string} businessId - Business ID
 * @param {string} videoId - YouTube video ID
 * @param {string} srtContent - SRT format caption content
 * @param {string} [language='en'] - Language code
 * @param {string} [name='English'] - Track name
 * @param {{ orbixChannelId?: string, useManual?: boolean }} [options] - orbixChannelId for per-channel YouTube; useManual = same as upload (manual OAuth)
 * @returns {Promise<Object>} Caption resource
 */
export async function uploadCaptions(businessId, videoId, srtContent, language = 'en', name = 'English', options = {}) {
  const fs = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  let tmpPath = null;
  const orbixChannelId = options.orbixChannelId || null;
  try {
    const auth = await getYouTubeClient(businessId, orbixChannelId, { useManual: options.useManual });
    const youtube = google.youtube({ version: 'v3', auth });
    tmpPath = join(tmpdir(), `orbix-captions-${Date.now()}.srt`);
    await fs.promises.writeFile(tmpPath, srtContent, 'utf8');
    console.log('[YouTube Publisher] Uploading captions videoId=', videoId, 'language=', language, 'size=', srtContent.length);
    const response = await youtube.captions.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          language,
          name: name.length > 150 ? name.slice(0, 150) : name
        }
      },
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(tmpPath)
      }
    });
    console.log('[YouTube Publisher] Captions uploaded captionId=', response.data.id);
    return response.data;
  } catch (error) {
    console.error('[YouTube Publisher] uploadCaptions failed', { videoId, message: error.message, code: error.code });
    throw error;
  } finally {
    if (tmpPath) {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }
}

/**
 * Update video metadata on YouTube
 * @param {string} businessId - Business ID
 * @param {string} videoId - YouTube video ID
 * @param {Object} metadata - Updated metadata
 * @returns {Promise<Object>} Updated video information
 */
export async function updateVideoMetadata(businessId, videoId, metadata) {
  try {
    const auth = await getYouTubeClient(businessId);
    const youtube = google.youtube({ version: 'v3', auth });
    
    // First, get current video to preserve existing data
    const currentVideo = await youtube.videos.list({
      part: ['snippet', 'status'],
      id: [videoId]
    });
    
    if (!currentVideo.data.items || currentVideo.data.items.length === 0) {
      throw new Error('Video not found');
    }
    
    const currentSnippet = currentVideo.data.items[0].snippet;
    const currentStatus = currentVideo.data.items[0].status;
    
    // Update video
    const response = await youtube.videos.update({
      part: ['snippet', 'status'],
      requestBody: {
        id: videoId,
        snippet: {
          ...currentSnippet,
          title: metadata.title || currentSnippet.title,
          description: metadata.description || currentSnippet.description,
          tags: metadata.tags || currentSnippet.tags
        },
        status: currentStatus
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('[YouTube Publisher] Error updating video metadata:', error);
    throw error;
  }
}

/**
 * Get video analytics from YouTube
 * @param {string} businessId - Business ID
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} Analytics data
 */
export async function getVideoAnalytics(businessId, videoId) {
  try {
    const auth = await getYouTubeClient(businessId);
    const youtube = google.youtube({ version: 'v3', auth });
    
    // Get video statistics
    const statsResponse = await youtube.videos.list({
      part: ['statistics', 'snippet'],
      id: [videoId]
    });
    
    if (!statsResponse.data.items || statsResponse.data.items.length === 0) {
      throw new Error('Video not found');
    }
    
    const video = statsResponse.data.items[0];
    const statistics = video.statistics;
    
    return {
      videoId,
      views: parseInt(statistics.viewCount || 0),
      likes: parseInt(statistics.likeCount || 0),
      comments: parseInt(statistics.commentCount || 0),
      title: video.snippet.title,
      publishedAt: video.snippet.publishedAt
    };
  } catch (error) {
    console.error('[YouTube Publisher] Error getting video analytics:', error);
    throw error;
  }
}

