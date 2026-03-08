import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, ''); // Remove trailing slash

console.log('[API] Initializing API client with URL:', API_URL);

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
  withCredentials: true, // send cookies cross-origin (e.g. tavarios.com -> api.tavarios.com)
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Multi-organization features removed - business context handled server-side via user.business_id
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
        console.error('[API] Network error: backend unreachable at', API_URL, '-', error.message);
      }
      return Promise.reject(new Error(`Unable to connect to server. Please check that the backend is running at ${API_URL}`));
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

// Diagnostics API
export const diagnosticsAPI = {
  getDashboard: () => api.get('/diagnostics/dashboard'),
  rebuildAssistant: () => api.post('/diagnostics/rebuild-assistant'),
  getRecentActivity: () => api.get('/diagnostics/recent-activity'),
};

// Menu API
export const menuAPI = {
  getAll: (params) => api.get('/menu', { params }),
  getFormatted: (params) => api.get('/menu/formatted', { params }),
  getById: (itemId) => api.get(`/menu/${itemId}`),
  create: (data) => api.post('/menu', data),
  update: (itemId, data) => api.put(`/menu/${itemId}`, data),
  delete: (itemId) => api.delete(`/menu/${itemId}`),
  // Global Modifiers
  getGlobalModifiers: (params) => api.get('/menu/global-modifiers', { params }),
  getGlobalModifierById: (modifierId) => api.get(`/menu/global-modifiers/${modifierId}`),
  createGlobalModifier: (data) => api.post('/menu/global-modifiers', data),
  updateGlobalModifier: (modifierId, data) => api.put(`/menu/global-modifiers/${modifierId}`, data),
  deleteGlobalModifier: (modifierId) => api.delete(`/menu/global-modifiers/${modifierId}`),
};

export default api;

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

// Agents API
export const agentsAPI = {
  get: () => api.get('/agents'),
  update: (data) => api.put('/agents', data),
  rebuild: () => api.post('/agents/rebuild'),
};

// Calls API
export const callsAPI = {
  list: (params) => api.get('/calls', { params }),
  get: (callId) => api.get(`/calls/${callId}`),
};

// Messages API
export const messagesAPI = {
  list: (params) => api.get('/messages', { params }),
  markRead: (messageId) => api.patch(`/messages/${messageId}/read`),
  markFollowUp: (messageId) => api.patch(`/messages/${messageId}/followup`),
};

// Usage API
export const usageAPI = {
  getStatus: () => api.get('/usage/status'),
  getMonthly: (year, month) => api.get('/usage/monthly', { params: { year, month } }),
};

// Setup API
export const setupAPI = {
  getStatus: () => api.get('/setup/status'),
  getData: () => api.get('/setup/data'),
  saveStep1: (data) => api.post('/setup/step1', data),
  saveStep2: (data) => api.post('/setup/step2', data),
  saveStep3: (data) => api.post('/setup/step3', data),
  saveStep4: (data) => api.post('/setup/step4', data),
  saveStep5: (data) => api.post('/setup/step5', data),
  finalize: () => api.post('/setup/finalize'),
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

// Support API
export const supportAPI = {
  createTicket: (data) => api.post('/support/tickets', data),
  getTickets: () => api.get('/support/tickets'),
  getTicket: (id) => api.get(`/support/tickets/${id}`),
  addResponse: (id, responseText) => api.post(`/support/tickets/${id}/response`, { response_text: responseText }),
};

// Account API
export const accountAPI = {
  cancel: (data) => api.post('/account/cancel', data),
  delete: (data) => api.post('/account/delete', data),
  export: () => api.get('/account/export'),
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

// Analytics API
export const analyticsAPI = {
  getCallAnalytics: (params) => api.get('/analytics/calls', { params }),
  getUsageTrends: (params) => api.get('/analytics/usage/trends', { params }),
  exportData: (type) => api.get('/analytics/export', { params: { type }, responseType: 'blob' }),
};

// Phone Numbers API (unified API for VAPI/Telnyx)
export const phoneNumbersAPI = {
  search: (params) => api.get('/phone-numbers/search', { params }),
  getAvailable: (areaCode) => api.get('/phone-numbers/available', { params: areaCode ? { areaCode } : {} }),
  assign: (phoneNumber, purchaseNew = false) => api.post('/phone-numbers/assign', { phone_number: phoneNumber, purchase_new: purchaseNew }),
  provision: (phoneNumber) => api.post('/phone-numbers/provision', { phoneNumber }),
  autoAssign: () => api.post('/phone-numbers/auto-assign'),
};

// Telnyx Phone Numbers API (legacy - used in setup wizard)
// Note: Uses provision endpoint which handles both existing and new number purchase
export const telnyxPhoneNumbersAPI = {
  search: (params) => api.get('/phone-numbers/search', { params }),
  purchase: (phoneNumber, _countryCode) => api.post('/business/phone-numbers/provision', { phoneNumber }),
  getCurrent: () => api.get('/phone-numbers/available'),
};

// Admin Phone Numbers API (uses regular api client but with admin token)
// Note: These routes are at /api/phone-numbers/admin/*, not /api/admin/phone-numbers/*
const getAdminToken = () => {
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  }
  return null;
};

// Create an admin phone numbers API client that uses the regular API base but with admin token
const adminPhoneNumbersApiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add admin token interceptor
adminPhoneNumbersApiClient.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const adminPhoneNumbersAPI = {
  getAvailable: (areaCode) => adminPhoneNumbersApiClient.get('/api/phone-numbers/admin/available', { params: areaCode ? { areaCode } : {} }),
  assign: (businessId, phoneNumber, purchaseNew = false) => adminPhoneNumbersApiClient.post(`/api/phone-numbers/admin/assign/${businessId}`, { phone_number: phoneNumber, purchase_new: purchaseNew }),
  change: (businessId, phoneNumber, purchaseNew = false) => adminPhoneNumbersApiClient.post(`/api/phone-numbers/admin/change/${businessId}`, { phone_number: phoneNumber, purchase_new: purchaseNew }),
};

// Admin API (uses admin token from cookie)
const adminApi = axios.create({
  baseURL: `${API_URL}/api/admin`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add admin auth token to requests
adminApi.interceptors.request.use((config) => {
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    const token = tokenCookie ? tokenCookie.split('=')[1] : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Admin Support API
export const adminSupportAPI = {
  getTickets: (params) => adminApi.get('/support/tickets', { params }),
  getTicket: (id) => adminApi.get(`/support/tickets/${id}`),
  updateStatus: (id, status, resolutionNotes) => adminApi.patch(`/support/tickets/${id}/status`, { status, resolution_notes: resolutionNotes }),
  addResponse: (id, responseText) => adminApi.post(`/support/tickets/${id}/response`, { response_text: responseText }),
};

// Admin Packages API
export const adminPackagesAPI = {
  getPackages: (includeInactive = false, module_key = null) => {
    const params = { includeInactive };
    if (module_key) params.module_key = module_key;
    return adminApi.get('/packages', { params });
  },
  getPackage: (id) => adminApi.get(`/packages/${id}`),
  createPackage: (data) => adminApi.post('/packages', data),
  updatePackage: (id, data) => adminApi.put(`/packages/${id}`, data),
  deletePackage: (id) => adminApi.delete(`/packages/${id}`),
};

// Admin SMS Phone Numbers API
export const adminSMSNumbersAPI = {
  getUnassigned: () => adminApi.get('/phone-numbers/unassigned'),
  assignSMS: (businessId, phoneNumber, isPrimary = false) => adminApi.post(`/phone-numbers/assign-sms/${businessId}`, { phone_number: phoneNumber, is_primary: isPrimary }),
  getBusinessNumbers: (businessId) => adminApi.get(`/phone-numbers/business/${businessId}`),
  removeNumber: (businessId, phoneNumberId) => adminApi.delete(`/phone-numbers/business/${businessId}/${phoneNumberId}`),
  migrateToTelnyx: (businessId) => adminApi.post(`/phone-numbers/migrate-to-telnyx/${businessId}`),
  verify: () => adminApi.get('/phone-numbers/verify'),
};

// Admin AI Assistants API
export const adminAssistantsAPI = {
  rebuildAll: () => adminApi.post('/rebuild-all-assistants'),
};

// Admin Invoice Settings API
export const adminInvoiceSettingsAPI = {
  get: () => adminApi.get('/invoice-settings'),
  update: (settings) => adminApi.put('/invoice-settings', settings),
};

// Bulk SMS API
export const bulkSMSAPI = {
  createCampaign: (data) => api.post('/bulk-sms/campaigns', data),
  getCampaigns: () => api.get('/bulk-sms/campaigns'),
  getCampaign: (id) => api.get(`/bulk-sms/campaigns/${id}`),
  cancelCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/cancel`),
  deleteCampaign: (id) => api.delete(`/bulk-sms/campaigns/${id}`),
  pauseCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/pause`),
  restartCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/restart`),
  resendCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/resend`),
  resendRecipients: (id, recipientIds) => api.post(`/bulk-sms/campaigns/${id}/resend-recipients`, { recipient_ids: recipientIds }),
  recoverCampaign: (id, options = {}) => api.post(`/bulk-sms/campaigns/${id}/recover`, options),
  diagnoseCampaign: (id) => api.get(`/bulk-sms/campaigns/${id}/diagnose`),
  resumeCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/resume`),
  testSMS: (data) => api.post('/bulk-sms/test', data),
  getRecipients: (id, status) => api.get(`/bulk-sms/campaigns/${id}/recipients`, { 
    params: status ? { status } : {} 
  }),
  getNumbers: () => api.get('/bulk-sms/numbers'),
  getOptOuts: () => api.get('/bulk-sms/opt-outs'),
  diagnose: () => api.get('/bulk-sms/diagnose'),
  debugOptOuts: () => api.get('/bulk-sms/debug-opt-outs'),
};

// Modules API (v2)
export const modulesAPI = {
  list: () => api.get('/v2/modules/list'),
  getAll: () => api.get('/v2/modules'),
  getModule: (moduleKey) => api.get(`/v2/modules/${moduleKey}`),
  activate: (moduleKey) => api.post(`/v2/modules/${moduleKey}/activate`),
};

// Reviews API (v2)
export const reviewsAPI = {
  generate: (data) => api.post('/v2/reviews/generate', data),
  getHistory: (params) => api.get('/v2/reviews/history', { params }),
  getUsage: () => api.get('/v2/reviews/usage'),
  getSettings: () => api.get('/v2/reviews/settings'),
  updateSettings: (settings) => api.put('/v2/reviews/settings', { settings }),
  getSetupStatus: () => api.get('/v2/reviews/setup/status'),
  saveSetupStep: (stepNumber, stepData) => api.post(`/v2/reviews/setup/step/${stepNumber}`, stepData),
  completeSetup: () => api.post('/v2/reviews/setup/complete'),
  submitFeedback: (outputId, feedbackType, adjustmentType = null, selectedReplyOption = null) => api.post('/v2/reviews/feedback', {
    output_id: outputId,
    feedback_type: feedbackType,
    adjustment_type: adjustmentType,
    selected_reply_option: selectedReplyOption
  }),
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
};

// Emergency Network API (v2). Requires X-Active-Business-Id for admin routes.
function emergencyNetworkHeaders() {
  if (typeof window === 'undefined') return {};
  const id = localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
  return id ? { 'X-Active-Business-Id': id } : {};
}
export const emergencyNetworkAPI = {
  getConfig: () => api.get('/v2/emergency-network/config', { headers: emergencyNetworkHeaders() }),
  getPhoneNumbers: () => api.get('/v2/emergency-network/phone-numbers', { headers: emergencyNetworkHeaders() }),
  createAgent: () => api.post('/v2/emergency-network/create-agent', {}, { headers: emergencyNetworkHeaders() }),
  linkAgent: () => api.post('/v2/emergency-network/link-agent', {}, { headers: emergencyNetworkHeaders() }),
  updateConfig: (data) => api.put('/v2/emergency-network/config', data, { headers: emergencyNetworkHeaders() }),
  getRequests: () => api.get('/v2/emergency-network/requests', { headers: emergencyNetworkHeaders() }),
  updateRequest: (id, data) => api.patch(`/v2/emergency-network/requests/${id}`, data, { headers: emergencyNetworkHeaders() }),
  callProvider: (requestId) => api.post(`/v2/emergency-network/requests/${requestId}/call-provider`, {}, { headers: emergencyNetworkHeaders() }),
  getProviders: () => api.get('/v2/emergency-network/providers', { headers: emergencyNetworkHeaders() }),
  createProvider: (data) => api.post('/v2/emergency-network/providers', data, { headers: emergencyNetworkHeaders() }),
  updateProvider: (id, data) => api.patch(`/v2/emergency-network/providers/${id}`, data, { headers: emergencyNetworkHeaders() }),
  deleteProvider: (id) => api.delete(`/v2/emergency-network/providers/${id}`, { headers: emergencyNetworkHeaders() }),
  getDispatchLog: (requestId) => api.get('/v2/emergency-network/dispatch-log', { params: requestId ? { request_id: requestId } : {}, headers: emergencyNetworkHeaders() }),
  getAnalytics: () => api.get('/v2/emergency-network/analytics', { headers: emergencyNetworkHeaders() }),
};

// Contacts API
export const contactsAPI = {
  getContacts: (params) => api.get('/contacts', { params }),
  getContact: (id) => api.get(`/contacts/${id}`),
  createContact: (data) => api.post('/contacts', data),
  updateContact: (id, data) => api.put(`/contacts/${id}`, data),
  deleteContact: (id) => api.delete(`/contacts/${id}`),
  uploadContacts: (formData) => api.post('/contacts/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getLists: () => api.get('/contacts/lists/all'),
  createList: (data) => api.post('/contacts/lists', data),
  getList: (id) => api.get(`/contacts/lists/${id}`),
  updateList: (id, data) => api.put(`/contacts/lists/${id}`, data),
  deleteList: (id) => api.delete(`/contacts/lists/${id}`),
  addContactToList: (listId, contactId) => api.post(`/contacts/lists/${listId}/contacts`, { contact_id: contactId }),
  removeContactFromList: (listId, contactId) => api.delete(`/contacts/lists/${listId}/contacts/${contactId}`),
  toggleOptOut: (contactId, optedOut) => api.post(`/contacts/${contactId}/opt-out`, { opted_out: optedOut }),
  syncOptOuts: () => api.post('/contacts/sync-opt-outs'),
};

// Kiosk API - uses token from URL query parameter
export const createKioskAPI = (token) => {
  const kioskApi = axios.create({
    baseURL: `${API_URL}/api/kiosk`,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000,
    // Do not rely on axios default params merging across calls; always add token per-request.
    params: {},
  });

  // Also add token to Authorization header as fallback
  kioskApi.interceptors.request.use((config) => {
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // Ensure token is ALWAYS present in query params (some calls pass { params } and can override defaults)
      config.params = { ...(config.params || {}), token };
    }
    return config;
  });

  return {
    getActiveOrders: () => kioskApi.get('/orders/active'),
    // Force token into params at the callsite too (extra safety vs any weird merge/override)
    getOrderHistory: (params = {}) => kioskApi.get('/orders/history', { params: { ...params, token } }),
    getOrder: (orderId) => kioskApi.get(`/orders/${orderId}`),
    updateOrderStatus: (orderId, status, estimated_ready_time) => 
      kioskApi.patch(`/orders/${orderId}/status`, { status, estimated_ready_time }),
    getReceipt: (orderId) => kioskApi.get(`/orders/${orderId}/receipt`),
    getTranscript: (orderId) => kioskApi.get(`/orders/${orderId}/transcript`),
    getSettings: () => kioskApi.get('/settings'),
  };
};


