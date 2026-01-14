/**
 * Orbix Network YouTube Publisher Service
 * Publishes videos to YouTube Shorts via YouTube Data API v3
 */

import { google } from 'googleapis';
import axios from 'axios';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

/**
 * Get YouTube OAuth2 client for a business
 * @param {string} businessId - Business ID
 * @returns {Promise<Object>} OAuth2 client
 */
async function getYouTubeClient(businessId) {
  try {
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    
    if (!moduleSettings?.settings?.youtube?.access_token) {
      throw new Error('YouTube not connected. Please connect your YouTube account in settings.');
    }
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );
    
    // Set credentials
    oauth2Client.setCredentials({
      access_token: moduleSettings.settings.youtube.access_token,
      refresh_token: moduleSettings.settings.youtube.refresh_token
    });
    
    // Handle token refresh
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        // Update stored access token
        const updatedSettings = {
          ...moduleSettings.settings,
          youtube: {
            ...moduleSettings.settings.youtube,
            access_token: tokens.access_token
          }
        };
        await ModuleSettings.update(businessId, 'orbix-network', updatedSettings);
      }
    });
    
    return oauth2Client;
  } catch (error) {
    console.error('[YouTube Publisher] Error getting YouTube client:', error);
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
 * Publish video to YouTube Shorts
 * @param {string} businessId - Business ID
 * @param {string} renderId - Render ID
 * @param {string} videoUrl - URL to video file (Supabase Storage)
 * @param {Object} metadata - Video metadata (title, description, etc.)
 * @returns {Promise<Object>} YouTube video information
 */
export async function publishVideo(businessId, renderId, videoUrl, metadata) {
  try {
    console.log(`[YouTube Publisher] Publishing video for render ${renderId}`);
    
    // Get YouTube client
    const auth = await getYouTubeClient(businessId);
    const youtube = google.youtube({ version: 'v3', auth });
    
    // Download video to local file (YouTube API requires file upload)
    const videoPath = await downloadVideo(videoUrl);
    
    try {
      // Get module settings for channel ID and visibility
      const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
      const visibility = moduleSettings?.settings?.publishing?.youtube_visibility || 'public';
      
      // Import fs for createReadStream
      const fs = await import('fs');
      
      // Upload video to YouTube
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: metadata.title,
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
      
      // Clean up local file
      await fs.default.promises.unlink(videoPath);
      
      console.log(`[YouTube Publisher] Video published: ${videoId}`);
      
      return {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: metadata.title
      };
    } catch (uploadError) {
      // Clean up local file on error
      try {
        await fs.default.promises.unlink(videoPath);
      } catch (unlinkError) {
        // Ignore cleanup errors
      }
      throw uploadError;
    }
  } catch (error) {
    console.error('[YouTube Publisher] Error publishing video:', error);
    throw error;
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

