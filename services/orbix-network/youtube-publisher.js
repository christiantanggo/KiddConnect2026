/**
 * Orbix Network YouTube Publisher Service
 * Publishes videos to YouTube Shorts via YouTube Data API v3
 */

import { google } from 'googleapis';
import axios from 'axios';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

/**
 * Get YouTube credentials for a business (and optionally a specific Orbix channel).
 * Uses settings.youtube_by_channel[orbixChannelId] when orbixChannelId is set and present; else settings.youtube (legacy).
 * @param {string} businessId - Business ID
 * @param {string} [orbixChannelId] - Orbix channel ID; when set, use that channel's YouTube connection
 * @returns {Promise<Object>} OAuth2 client
 */
async function getYouTubeClient(businessId, orbixChannelId = null) {
  try {
    console.log('[YouTube Publisher] getYouTubeClient businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'legacy');
    const hasClientId = !!process.env.YOUTUBE_CLIENT_ID;
    const hasClientSecret = !!process.env.YOUTUBE_CLIENT_SECRET;
    const hasRedirectUri = !!process.env.YOUTUBE_REDIRECT_URI;
    if (!hasClientId || !hasClientSecret || !hasRedirectUri) {
      console.error('[YouTube Publisher] Missing env: YOUTUBE_CLIENT_ID=', hasClientId, 'YOUTUBE_CLIENT_SECRET=', hasClientSecret, 'YOUTUBE_REDIRECT_URI=', hasRedirectUri);
      throw new Error('YouTube OAuth not configured (missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REDIRECT_URI).');
    }

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    if (!moduleSettings) {
      console.error('[YouTube Publisher] No module settings found for businessId=', businessId, 'module=orbix-network');
      throw new Error('YouTube not connected. Please connect your YouTube account in settings.');
    }
    const settings = moduleSettings.settings || {};
    const byChannel = settings.youtube_by_channel || {};
    let yt = null;
    let usePerChannel = false;
    if (orbixChannelId && byChannel[orbixChannelId]?.access_token) {
      yt = byChannel[orbixChannelId];
      usePerChannel = true;
    }
    if (!yt && settings.youtube?.access_token) {
      yt = settings.youtube;
    }
    if (!yt || !yt.access_token) {
      const msg = usePerChannel
        ? 'YouTube not connected for this channel. Connect in Orbix Network → Settings for this channel.'
        : 'YouTube not connected. Please connect your YouTube account in settings.';
      if (yt?.channel_id) {
        throw new Error('YouTube was connected but credentials are missing or expired. Go to Orbix Network → Settings, disconnect YouTube for this channel, then connect again.');
      }
      throw new Error(msg);
    }
    if (!yt.refresh_token) {
      console.warn('[YouTube Publisher] No refresh_token for businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'n/a');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );

    const expiryDate = yt.token_expiry ? new Date(yt.token_expiry).getTime() : null;
    oauth2Client.setCredentials({
      access_token: yt.access_token,
      refresh_token: yt.refresh_token,
      ...(expiryDate ? { expiry_date: expiryDate } : {})
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        console.log('[YouTube Publisher] Token refreshed for businessId=', businessId, 'orbixChannelId=', orbixChannelId || 'legacy');
        const updatedSettings = { ...moduleSettings.settings };
        const updatedYt = {
          ...(usePerChannel ? byChannel[orbixChannelId] : updatedSettings.youtube),
          access_token: tokens.access_token,
          ...(tokens.expiry_date ? { token_expiry: new Date(tokens.expiry_date).toISOString() } : {})
        };
        if (usePerChannel) {
          updatedSettings.youtube_by_channel = { ...byChannel, [orbixChannelId]: updatedYt };
        } else {
          updatedSettings.youtube = updatedYt;
        }
        await ModuleSettings.update(businessId, 'orbix-network', updatedSettings);
      }
    });

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
 * @param {{ orbixChannelId?: string }} [options] - Optional; orbixChannelId = Orbix channel to use for upload (per-channel YouTube)
 * @returns {Promise<Object>} YouTube video information { videoId, url, title }
 */
export async function publishVideo(businessId, renderId, videoUrlOrPath, metadata, options = {}) {
  const fs = await import('fs');
  let videoPath = null;
  let shouldUnlink = false;
  const orbixChannelId = options.orbixChannelId || null;

  try {
    const isUrl = isVideoUrl(videoUrlOrPath);
    console.log('[YouTube Publisher] publishVideo start', { businessId, renderId, orbixChannelId, title: metadata?.title, inputType: isUrl ? 'url' : 'path' });

    const auth = await getYouTubeClient(businessId, orbixChannelId);
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
    console.log('[YouTube Publisher] Calling YouTube API videos.insert visibility=', visibility);

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

    if (shouldUnlink) {
      await fs.default.promises.unlink(videoPath).catch(() => {});
    }

    console.log(`[YouTube Publisher] Video published: ${videoId}`);

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
    console.error('[YouTube Publisher] publishVideo failed', {
      renderId,
      businessId,
      message: error.message,
      code: error.code,
      status: error.response?.status,
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
 * @param {{ orbixChannelId?: string }} [options] - Optional; orbixChannelId for per-channel YouTube
 * @returns {Promise<Object>} Caption resource
 */
export async function uploadCaptions(businessId, videoId, srtContent, language = 'en', name = 'English', options = {}) {
  const fs = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  let tmpPath = null;
  const orbixChannelId = options.orbixChannelId || null;
  try {
    const auth = await getYouTubeClient(businessId, orbixChannelId);
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

