import axios from 'axios';
import Cookies from 'js-cookie';

const DEFAULT_API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5003').replace(/\/$/, '');
/** Runtime override before app loads (no redeploy). */
export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    if (window.__KIDDCONNECT_API_URL__) {
      return String(window.__KIDDCONNECT_API_URL__).replace(/\/$/, '');
    }
    if (window.__TAVARI_API_URL__) {
      return String(window.__TAVARI_API_URL__).replace(/\/$/, '');
    }
  }
  return DEFAULT_API_URL;
}

console.log('[API] Initializing API client with URL:', getApiBaseUrl());

const api = axios.create({
  baseURL: `${getApiBaseUrl()}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
  withCredentials: true, // cross-origin cookies (e.g. www.lefournier.ca -> api.lefournier.ca)
});

// Use current API URL on every request (so runtime override works)
api.interceptors.request.use((config) => {
  config.baseURL = `${getApiBaseUrl()}/api`;
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Let browser set multipart/form-data with boundary when sending FormData (default Content-Type is application/json)
  if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Retry logic for rate limiting (429 errors)
const retryRequest = async (config, retries = 2) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await api.request(config);
    } catch (retryError) {
      // DON'T retry 429 errors - they need user action or time
      if (retryError.response?.status === 429) {
        console.warn('[API] Rate limit (429) - NOT retrying, user needs to wait');
        throw retryError;
      }
      
      // For other errors, retry with exponential backoff
      if (i === retries - 1) {
        throw retryError;
      }
      
      // Exponential backoff: wait 1s, 2s, 4s
      const delay = Math.pow(2, i) * 1000;
      console.log(`[API] Retrying request after ${delay}ms (attempt ${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Throttle network error logs when backend is down (avoid console flood from polling)
let lastNetworkErrorLog = 0;
const NETWORK_ERROR_LOG_INTERVAL_MS = 30000;

// Handle auth errors and rate limiting
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Log network errors for debugging, but only once per 30s to avoid console flood
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || !error.response) {
      const now = Date.now();
      if (now - lastNetworkErrorLog >= NETWORK_ERROR_LOG_INTERVAL_MS) {
        lastNetworkErrorLog = now;
        console.error('[API] Network error: backend unreachable at', getApiBaseUrl(), '-', error.message);
      }
      const url = getApiBaseUrl();
      return Promise.reject(new Error(`Unable to connect to server. FIX: In Vercel set NEXT_PUBLIC_API_URL to your backend URL (e.g. your Railway URL), then redeploy. Current: ${url}`));
    }
    
    if (error.response?.status === 401) {
      Cookies.remove('token');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    
    // DON'T auto-retry on 429 (rate limit) errors - they need user action or time
    // Auto-retrying causes infinite loops and makes rate limiting worse
    if (error.response?.status === 429) {
      console.warn('[API] Rate limit (429) detected - NOT auto-retrying');
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateEmail: (email) => api.put('/auth/me/email', { email }),
  updatePassword: (currentPassword, newPassword) => api.put('/auth/me/password', { currentPassword, newPassword }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: ({ code, email, password }) => api.post('/auth/reset-password', { code, email, password }),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (userId, data) => api.put(`/auth/users/${userId}`, data),
  deleteUser: (userId) => api.delete(`/auth/users/${userId}`),
};

// Usage API
export const usageAPI = {
  getStatus: () => api.get('/usage/status'),
  getMonthly: (year, month) => api.get('/usage/monthly', { params: { year, month } }),
};

// Billing API
export const billingAPI = {
  getStatus: () => api.get('/billing/status'),
  getPortal: () => api.get('/billing/portal'),
  getPackages: (moduleKey = null) => {
    const params = moduleKey ? { module_key: moduleKey } : {};
    return api.get('/billing/packages', { params });
  },
  createCheckout: (packageId) => api.post('/billing/checkout', { packageId }),
  verifyStripeSession: (sessionId) => api.get('/billing/verify-session', { params: { session_id: sessionId } }),
  getTestMode: () => api.get('/billing/test-mode'),
};

// Invoices API
export const invoicesAPI = {
  list: () => api.get('/invoices'),
  get: (id) => api.get(`/invoices/${id}`),
  downloadPDF: (id) => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
};

// Business API
export const businessAPI = {
  updateSettings: (data) => api.put('/business/settings', data),
  retryActivation: () => api.post('/business/retry-activation'),
  searchPhoneNumbers: (params) => api.get('/business/phone-numbers/search', { params }),
  provisionPhoneNumber: (data) => api.post('/business/phone-numbers/provision', data),
  linkAssistant: () => api.post('/business/link-assistant'),
  sendTestEmail: () => api.post('/business/test-email'),
  sendTestSMS: (data) => api.post('/business/test-sms', data),
  sendTestMissedCall: (data) => api.post('/business/test-missed-call', data),
  // Kiosk token management
  generateKioskToken: () => api.post('/business/kiosk-token'),
  getKioskToken: () => api.get('/business/kiosk-token'),
  revokeKioskToken: () => api.delete('/business/kiosk-token'),
};

// Modules API (v2)
export const modulesAPI = {
  list: () => api.get('/v2/modules/list'),
  getAll: () => api.get('/v2/modules'),
  getModule: (moduleKey) => api.get(`/v2/modules/${moduleKey}`),
  activate: (moduleKey) => api.post(`/v2/modules/${moduleKey}/activate`),
};

// Orbix Network API (v2). Channel-scoped methods require channel_id in params or body.
export const orbixNetworkAPI = {
  // Channels (no channel_id required)
  getChannels: () => api.get('/v2/orbix-network/channels'),
  createChannel: (data) => api.post('/v2/orbix-network/channels', data),
  updateChannel: (id, data) => api.patch(`/v2/orbix-network/channels/${id}`, data),
  deleteChannel: (id) => api.delete(`/v2/orbix-network/channels/${id}`),
  getSetupStatus: () => api.get('/v2/orbix-network/setup/status'),
  startSetup: () => api.post('/v2/orbix-network/setup/start'),
  saveSetup: (step, stepData) => api.post('/v2/orbix-network/setup/save', { step, stepData }),
  completeSetup: () => api.post('/v2/orbix-network/setup/complete'),
  getStories: (params) => api.get('/v2/orbix-network/stories', { params }),
  getStory: (id, params) => api.get(`/v2/orbix-network/stories/${id}`, { params }),
  deleteStory: (id, params, { delete_raw_item } = {}) =>
    api.delete(`/v2/orbix-network/stories/${id}`, { params: { ...params, ...(delete_raw_item ? { delete_raw_item: 'true' } : {}) } }),
  getRenders: (params) => api.get('/v2/orbix-network/renders', { params }),
  getPipeline: (params) => api.get('/v2/orbix-network/pipeline', { params }),
  getRender: (id, params) => api.get(`/v2/orbix-network/renders/${id}`, { params }),
  deleteRender: (id, params) => api.delete(`/v2/orbix-network/renders/${id}`, { params }),
  cancelRender: (id, params) => api.delete(`/v2/orbix-network/renders/${id}`, { params }),
  restartRender: (id, params, storyId) => api.post(`/v2/orbix-network/renders/${id}/restart`, {}, { params: { ...params, ...(storyId ? { story_id: storyId } : {}) } }),
  uploadToYouTube: (id, params) => api.post(`/v2/orbix-network/renders/${id}/upload-to-youtube`, {}, { params }),
  uploadRenderToYoutube: (id, params) => api.post(`/v2/orbix-network/renders/${id}/upload-to-youtube`, {}, { params }),
  /** Download video file (blob). Use response.data and trigger browser download with a filename. */
  downloadVideo: (id, params) => api.get(`/v2/orbix-network/renders/${id}/download-video`, { params, responseType: 'blob', timeout: 120000 }),
  resetUploadState: (id, params) => api.post(`/v2/orbix-network/renders/${id}/reset-upload`, {}, { params }),
  getPublishes: (params) => api.get('/v2/orbix-network/publishes', { params }),
  getRawItems: (params) => api.get('/v2/orbix-network/raw-items', { params }),
  deleteRawItem: (id, params) => api.delete(`/v2/orbix-network/raw-items/${id}`, { params }),
  getSources: (params) => api.get('/v2/orbix-network/sources', { params }),
  addSource: (data) => api.post('/v2/orbix-network/sources', data), // include channel_id in data
  updateSource: (id, data, params) => api.put(`/v2/orbix-network/sources/${id}`, data, { params }),
  deleteSource: (id, params) => api.delete(`/v2/orbix-network/sources/${id}`, { params }),
  getReviewQueue: (params) => api.get('/v2/orbix-network/review-queue', { params }),
  approveStory: (id, params) => api.post(`/v2/orbix-network/stories/${id}/approve`, {}, { params }),
  approveAllStories: (params) => api.post('/v2/orbix-network/stories/approve-all', {}, { params }),
  rejectStory: (id, params) => api.post(`/v2/orbix-network/stories/${id}/reject`, {}, { params }),
  generateScriptForStory: (id, params) => api.post(`/v2/orbix-network/stories/${id}/generate-script`, {}, { params }),
  startRenderForStory: (id, params) => api.post(`/v2/orbix-network/stories/${id}/start-render`, {}, { params }),
  forceRenderStory: (id, params) => api.post(`/v2/orbix-network/stories/${id}/force-render`, {}, { params }),
  editScriptHook: (id, hook, params) => api.post(`/v2/orbix-network/stories/${id}/script/edit-hook`, { hook }, { params }),
  editTriviaContent: (id, body, params) => api.post(`/v2/orbix-network/stories/${id}/script/edit-trivia`, body, { params }),
  editRiddleContent: (id, body, params) => api.post(`/v2/orbix-network/stories/${id}/script/edit-riddle`, body, { params }),
  editDadJokeContent: (id, body, params) => api.post(`/v2/orbix-network/stories/${id}/script/edit-dadjoke`, body, { params }),
  getAnalytics: (params) => api.get('/v2/orbix-network/analytics', { params }),
  getYoutubeAuthUrl: (params) => api.get('/v2/orbix-network/youtube/auth-url', { params }),
  getYoutubeChannel: (params) => api.get('/v2/orbix-network/youtube/channel', { params }),
  saveYoutubeCustomOauth: (data) => api.post('/v2/orbix-network/youtube/custom-oauth', data),
  disconnectYoutube: (data) => api.post('/v2/orbix-network/youtube/disconnect', data || {}),
  saveChannelAutoUpload: (data) => api.post('/v2/orbix-network/settings/channel-auto-upload', data),
  getBackgrounds: (params) => api.get('/v2/orbix-network/backgrounds', { params }),
  uploadBackground: (formData) => api.post('/v2/orbix-network/backgrounds', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  }),
  deleteBackground: (data) => api.delete('/v2/orbix-network/backgrounds', { data }),
  getMusic: (params) => api.get('/v2/orbix-network/music', { params }),
  uploadMusic: (formData) => api.post('/v2/orbix-network/music', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  }),
  triggerScrapeJob: (body) => api.post('/v2/orbix-network/jobs/scrape', body ?? {}, { timeout: 120000 }),
  cleanupOldData: (olderThanDays = 10, params) => api.post('/v2/orbix-network/cleanup', { older_than_days: olderThanDays }, { params }),
  triggerProcessJob: () => api.post('/v2/orbix-network/jobs/process'),
  triggerReviewQueueJob: () => api.post('/v2/orbix-network/jobs/review-queue'),
  triggerRenderJob: () => api.post('/v2/orbix-network/jobs/render'),
  triggerAutomatedPipeline: () => api.post('/v2/orbix-network/jobs/automated-pipeline'),
  triggerPublishJob: () => api.post('/v2/orbix-network/jobs/publish'),
  getUploadLimitStatus: () => api.get('/v2/orbix-network/jobs/upload-limit-status'),
  getUploadCountLast24h: (params) => api.get('/v2/orbix-network/jobs/upload-count-last-24h', { params }),
  forceProcessRawItem: (id, params) => api.post(`/v2/orbix-network/raw-items/${id}/force-process`, {}, { params }),
  forceScoreRawItem: (id, params) => api.post(`/v2/orbix-network/raw-items/${id}/force-score`, {}, { params }),
  allowStoryRawItem: (id, params) => api.post(`/v2/orbix-network/raw-items/${id}/allow-story`, {}, { params }),
  allowAllRawItems: (params) => api.post('/v2/orbix-network/raw-items/allow-all', {}, { params }),
  // Long-form (puzzle library + long-form videos). All require channel_id in params or body.
  getLongformPuzzles: (params) => api.get('/v2/orbix-network/longform/puzzles', { params }),
  getLongformPuzzle: (id, params) => api.get(`/v2/orbix-network/longform/puzzles/${id}`, { params }),
  getLongformVideos: (params) => api.get('/v2/orbix-network/longform/videos', { params }),
  getLongformVideo: (id, params) => api.get(`/v2/orbix-network/longform/videos/${id}`, { params }),
  createLongformVideo: (data) => api.post('/v2/orbix-network/longform/videos', data),
  // Dad Jokes long-form only (channel must have Dad Joke Generator source)
  getLongformDadjokeJokes: (params) => api.get('/v2/orbix-network/longform/dadjoke/jokes', { params }),
  generateLongformDadjokeScript: (data) => api.post('/v2/orbix-network/longform/dadjoke/generate-script', data, { timeout: 180000 }),
  createLongformDadjokeVideo: (data) => api.post('/v2/orbix-network/longform/dadjoke/videos', data),
  generateLongformDadjokeBackground: (id, params) => api.post(`/v2/orbix-network/longform/dadjoke/videos/${id}/generate-background`, {}, { params, timeout: 300000 }),
  uploadLongformDadjokeSegmentImage: (id, formData, params) =>
    api.post(`/v2/orbix-network/longform/dadjoke/videos/${id}/segment-image`, formData, { params, timeout: 60000 }),
  updateLongformDadjokeScript: (id, body, params) =>
    api.patch(`/v2/orbix-network/longform/dadjoke/videos/${id}/script`, body, { params }),
  rewriteLongformDadjokeScript: (id, params) =>
    api.post(`/v2/orbix-network/longform/dadjoke/videos/${id}/rewrite-script`, {}, { params }),
  startLongformDadjokeRender: (id, params) =>
    api.post(`/v2/orbix-network/longform/dadjoke/videos/${id}/start-render`, {}, { params, timeout: 15000 }),
  resetLongformDadjokeRender: (id, params) =>
    api.post(`/v2/orbix-network/longform/dadjoke/videos/${id}/reset-render`, {}, { params }),
  uploadLongformDadjokeToYoutube: (id, params) =>
    api.post(`/v2/orbix-network/longform/dadjoke/videos/${id}/upload-to-youtube`, {}, { params }),
};

// V2 Settings – business profile (timezone, etc.). Uses same active-business header for consistency.
function v2ActiveBusinessHeaders() {
  if (typeof window === 'undefined') return {};
  const id = localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
  return id ? { 'X-Active-Business-Id': id } : {};
}
export const settingsV2API = {
  getBusiness: () => api.get('/v2/settings/business', { headers: v2ActiveBusinessHeaders() }),
};

export default api;
