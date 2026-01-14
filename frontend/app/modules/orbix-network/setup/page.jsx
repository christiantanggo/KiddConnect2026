'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, ArrowRight, Check, Loader, CheckCircle2, AlertCircle, Plus, Trash2, ExternalLink } from 'lucide-react';

const TOTAL_STEPS = 5;

function OrbixNetworkSetupWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showErrorToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupStatus, setSetupStatus] = useState(null);
  const [existingData, setExistingData] = useState(null);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeChannel, setYoutubeChannel] = useState(null);
  const [connectingYouTube, setConnectingYouTube] = useState(false);
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [formData, setFormData] = useState({
    step1: {}, // YouTube API Setup
    step2: {}, // Source Configuration (optional)
    step3: {}, // Review Preferences
    step4: {}, // Publishing Preferences
    step5: {}  // Background Preferences
  });

  useEffect(() => {
    loadSetupStatus();
    checkYoutubeConnection();
    
    // Check for OAuth callback params
    const youtubeConnected = searchParams.get('youtube_connected');
    const error = searchParams.get('error');
    
    if (youtubeConnected === 'true') {
      success('YouTube account connected successfully!');
      checkYoutubeConnection();
      // Remove query param
      router.replace('/modules/orbix-network/setup');
    } else if (error) {
      if (error === 'youtube_oauth_denied') {
        showErrorToast('YouTube connection was cancelled');
      } else if (error === 'youtube_not_configured') {
        showErrorToast('YouTube OAuth is not configured. Please contact support.');
      } else {
        showErrorToast('Failed to connect YouTube account');
      }
      router.replace('/modules/orbix-network/setup');
    }
  }, [searchParams]);

  const loadSetupStatus = async () => {
    try {
      setLoading(true);
      const response = await orbixNetworkAPI.getSetupStatus();
      setSetupStatus(response.data.setup_status);
      setExistingData(response.data.existing_data);
      
      // If setup is already complete, redirect to dashboard
      if (response.data.setup_status?.is_complete) {
        router.push('/dashboard/v2/modules/orbix-network/dashboard');
        return;
      }
      
      // Pre-fill form with existing data
      if (response.data.existing_data) {
        setFormData({
          step1: {
            youtube_channel_id: response.data.existing_data.youtube_channel_id || ''
          },
          step2: {
            sources: response.data.existing_data.sources || []
          },
          step3: {
            review_mode_enabled: response.data.existing_data.review_mode_enabled !== false,
            auto_approve_minutes: response.data.existing_data.auto_approve_minutes || 60
          },
          step4: {
            youtube_visibility: response.data.existing_data.youtube_visibility || 'public',
            enable_rumble: response.data.existing_data.enable_rumble || false,
            daily_video_cap: response.data.existing_data.daily_video_cap || 5
          },
          step5: {
            background_random_mode: response.data.existing_data.background_random_mode || 'uniform'
          }
        });
        
        // Resume from saved step
        if (response.data.setup_status.current_step && response.data.setup_status.current_step <= TOTAL_STEPS) {
          setCurrentStep(response.data.setup_status.current_step);
        }
      }
    } catch (error) {
      console.error('Failed to load setup status:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load setup');
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (step, field, value) => {
    setFormData(prev => ({
      ...prev,
      [step]: {
        ...prev[step],
        [field]: value
      }
    }));
  };

  const validateStep = (step) => {
    switch (step) {
      case 1:
        // YouTube setup - can skip for now (will be implemented with OAuth)
        return true;
      case 2:
        // Sources - optional
        return true;
      case 3:
        // Review preferences - has defaults
        return true;
      case 4:
        // Publishing preferences - has defaults
        return true;
      case 5:
        // Background preferences - has defaults
        return true;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (!validateStep(currentStep)) {
      showErrorToast('Please complete all required fields');
      return;
    }

    try {
      setSaving(true);
      
      // Save current step
      await orbixNetworkAPI.saveSetup(currentStep, formData[`step${currentStep}`]);
      
      // If this is the last step, complete setup
      if (currentStep === TOTAL_STEPS) {
        await orbixNetworkAPI.completeSetup();
        success('Setup complete! You can now use Orbix Network.');
        router.push('/dashboard/v2/modules/orbix-network/dashboard');
      } else {
        // Move to next step
        setCurrentStep(currentStep + 1);
      }
    } catch (error) {
      console.error('Failed to save step:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to save step');
      if (errorInfo.redirect) {
        router.push(errorInfo.redirect);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const checkYoutubeConnection = async () => {
    try {
      const response = await orbixNetworkAPI.getYoutubeChannel();
      setYoutubeConnected(response.data.connected);
      setYoutubeChannel(response.data.channel);
    } catch (error) {
      console.error('Failed to check YouTube connection:', error);
      // Non-critical - just don't show connected status
    }
  };

  const handleConnectYouTube = async () => {
    try {
      setConnectingYouTube(true);
      const response = await orbixNetworkAPI.getYoutubeAuthUrl();
      // Redirect to YouTube OAuth
      window.location.href = response.data.auth_url;
    } catch (error) {
      console.error('Failed to get YouTube auth URL:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to connect YouTube account');
      setConnectingYouTube(false);
    }
  };

  useEffect(() => {
    if (currentStep === 2) {
      loadSources();
    }
  }, [currentStep]);

  const loadSources = async () => {
    try {
      setLoadingSources(true);
      const response = await orbixNetworkAPI.getSources();
      setSources(response.data.sources || []);
    } catch (error) {
      console.error('Failed to load sources:', error);
      showErrorToast('Failed to load sources');
    } finally {
      setLoadingSources(false);
    }
  };

  const handleAddSource = async (sourceData) => {
    try {
      const response = await orbixNetworkAPI.addSource(sourceData);
      await loadSources();
      success('Source added successfully');
      return response.data.source;
    } catch (error) {
      console.error('Failed to add source:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to add source');
      throw error;
    }
  };

  const handleDeleteSource = async (sourceId) => {
    try {
      await orbixNetworkAPI.deleteSource(sourceId);
      await loadSources();
      success('Source deleted successfully');
    } catch (error) {
      console.error('Failed to delete source:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to delete source');
    }
  };

  const handleSkip = async () => {
    // Skip to next step (save empty data)
    try {
      setSaving(true);
      await orbixNetworkAPI.saveSetup(currentStep, {});
      if (currentStep === TOTAL_STEPS) {
        await orbixNetworkAPI.completeSetup();
        success('Setup complete!');
        router.push('/dashboard/v2/modules/orbix-network');
      } else {
        setCurrentStep(currentStep + 1);
      }
    } catch (error) {
      console.error('Failed to skip step:', error);
      showErrorToast('Failed to skip step');
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">YouTube API Setup</h2>
              <p className="text-gray-600 mb-6">
                Connect your YouTube account to enable automatic video publishing to YouTube Shorts.
              </p>
            </div>

            {youtubeConnected && youtubeChannel ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      YouTube Connected
                    </p>
                    <p className="text-sm text-green-700">
                      Channel: {youtubeChannel.title || youtubeChannel.id}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800 mb-4">
                  Connect your YouTube account to automatically publish videos to your channel.
                </p>
                <button
                  onClick={handleConnectYouTube}
                  disabled={connectingYouTube}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {connectingYouTube ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                      Connect YouTube Account
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                <strong>Note:</strong> You can skip this step and connect YouTube later from the settings page.
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Source Configuration</h2>
              <p className="text-gray-600 mb-6">
                Configure news sources to scrape. You can skip this step and add sources later.
              </p>
            </div>

            <SourceConfigurationStep 
              sources={sources}
              loading={loadingSources}
              onAddSource={handleAddSource}
              onDeleteSource={handleDeleteSource}
            />
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Review Preferences</h2>
              <p className="text-gray-600 mb-6">
                Configure how stories are reviewed before publishing.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="review_mode_enabled"
                  checked={formData.step3.review_mode_enabled !== false}
                  onChange={(e) => updateFormData('step3', 'review_mode_enabled', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="review_mode_enabled" className="ml-2 text-sm font-medium text-gray-700">
                  Enable human review before publishing
                </label>
              </div>

              {formData.step3.review_mode_enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Auto-approve after (minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.step3.auto_approve_minutes || 60}
                    onChange={(e) => updateFormData('step3', 'auto_approve_minutes', parseInt(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="60"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Stories will be automatically approved if not reviewed within this time.
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Publishing Preferences</h2>
              <p className="text-gray-600 mb-6">
                Configure how videos are published to YouTube.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  YouTube Visibility
                </label>
                <select
                  value={formData.step4.youtube_visibility || 'public'}
                  onChange={(e) => updateFormData('step4', 'youtube_visibility', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Daily Video Cap
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.step4.daily_video_cap || 5}
                  onChange={(e) => updateFormData('step4', 'daily_video_cap', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Maximum number of videos to publish per day.
                </p>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Background Preferences</h2>
              <p className="text-gray-600 mb-6">
                Configure how background images are selected for videos.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Randomization Mode
                </label>
                <select
                  value={formData.step5.background_random_mode || 'uniform'}
                  onChange={(e) => updateFormData('step5', 'background_random_mode', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="uniform">Uniform (equal chance for all backgrounds)</option>
                  <option value="weighted">Weighted (based on performance)</option>
                </select>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-screen">
            <Loader className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="max-w-4xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold mb-2">Orbix Network Setup</h1>
            <p className="text-gray-600">
              Step {currentStep} of {TOTAL_STEPS}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>

          {/* Step Content */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
            {renderStep()}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <div>
              {currentStep > 1 && (
                <button
                  onClick={handleBack}
                  disabled={saving}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-2" />
                  Back
                </button>
              )}
            </div>

            <div className="flex gap-4">
              {(currentStep === 2) && (
                <button
                  onClick={handleSkip}
                  disabled={saving}
                  className="px-6 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  Skip
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {saving ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : currentStep === TOTAL_STEPS ? (
                  <>
                    Complete Setup
                    <Check className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

// Source Configuration Step Component
function SourceConfigurationStep({ sources, loading, onAddSource, onDeleteSource }) {
  const { success, error: showErrorToast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    type: 'RSS',
    enabled: true,
    fetch_interval_minutes: 60,
    category_hint: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.url) {
      showErrorToast('Please fill in all required fields');
      return;
    }

    try {
      setAdding(true);
      await onAddSource(formData);
      setFormData({
        name: '',
        url: '',
        type: 'RSS',
        enabled: true,
        fetch_interval_minutes: 60,
        category_hint: ''
      });
      setShowAddForm(false);
    } catch (error) {
      // Error already handled in parent
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          Add RSS feeds or HTML pages to scrape for news stories. Sources can also be managed from the dashboard after setup.
        </p>
      </div>

      {/* Add Source Button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Source
        </button>
      )}

      {/* Add Source Form */}
      {showAddForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Add News Source</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="e.g., TechCrunch RSS"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Type *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              >
                <option value="RSS">RSS Feed</option>
                <option value="HTML">HTML Page</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL *
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="https://example.com/feed.xml"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fetch Interval (minutes)
              </label>
              <input
                type="number"
                min="1"
                value={formData.fetch_interval_minutes}
                onChange={(e) => setFormData({ ...formData, fetch_interval_minutes: parseInt(e.target.value) || 60 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category Hint (optional)
              </label>
              <input
                type="text"
                value={formData.category_hint}
                onChange={(e) => setFormData({ ...formData, category_hint: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="e.g., tech-decisions"
              />
            </div>

            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {adding ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Source
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({
                    name: '',
                    url: '',
                    type: 'RSS',
                    enabled: true,
                    fetch_interval_minutes: 60,
                    category_hint: ''
                  });
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sources List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">
          Configured Sources ({sources.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : sources.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p className="text-gray-600">No sources configured yet.</p>
            <p className="text-sm text-gray-500 mt-2">
              Add your first source using the button above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-gray-900">{source.name}</h4>
                    <span className={`px-2 py-1 text-xs rounded ${
                      source.enabled 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {source.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                      {source.type}
                    </span>
                  </div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {source.url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {source.fetch_interval_minutes && (
                    <p className="text-sm text-gray-500 mt-1">
                      Fetched every {source.fetch_interval_minutes} minutes
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onDeleteSource(source.id)}
                  className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete source"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default OrbixNetworkSetupWizard;

