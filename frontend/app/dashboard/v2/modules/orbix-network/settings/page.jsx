'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { orbixNetworkAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { handleAPIError } from '@/lib/errorHandler';
import { ArrowLeft, Loader, Save, Plus, Edit, Trash2, X } from 'lucide-react';

export default function OrbixNetworkSettingsPage() {
  const router = useRouter();
  const { success, error: showErrorToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sources, setSources] = useState([]);
  const [editingSource, setEditingSource] = useState(null);
  const [showAddSource, setShowAddSource] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState({
    review_mode_enabled: true,
    auto_approve_minutes: 60,
    youtube_visibility: 'public',
    enable_rumble: false,
    daily_video_cap: 5,
    background_random_mode: 'uniform',
    shock_score_threshold: 65
  });
  
  // Source form state
  const [sourceForm, setSourceForm] = useState({
    type: 'RSS',
    url: '',
    name: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sourcesRes, setupRes] = await Promise.all([
        orbixNetworkAPI.getSources().catch(() => ({ data: { sources: [] } })),
        orbixNetworkAPI.getSetupStatus().catch(() => ({ data: { existing_data: {} } }))
      ]);
      
      setSources(sourcesRes.data.sources || []);
      
      // Load settings from setup data
      if (setupRes.data.existing_data) {
        const data = setupRes.data.existing_data;
        setSettings({
          review_mode_enabled: data.review_mode_enabled !== false,
          auto_approve_minutes: data.auto_approve_minutes || 60,
          youtube_visibility: data.youtube_visibility || 'public',
          enable_rumble: data.enable_rumble || false,
          daily_video_cap: data.daily_video_cap || 5,
          background_random_mode: data.background_random_mode || 'uniform',
          shock_score_threshold: data.shock_score_threshold || 65
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      // Save via setup endpoint (settings are stored in module_settings)
      await orbixNetworkAPI.saveSetup(3, {
        review_mode_enabled: settings.review_mode_enabled,
        auto_approve_minutes: settings.auto_approve_minutes,
        shock_score_threshold: settings.shock_score_threshold
      });
      await orbixNetworkAPI.saveSetup(4, {
        youtube_visibility: settings.youtube_visibility,
        enable_rumble: settings.enable_rumble,
        daily_video_cap: settings.daily_video_cap
      });
      await orbixNetworkAPI.saveSetup(5, {
        background_random_mode: settings.background_random_mode
      });
      success('Settings saved');
    } catch (error) {
      console.error('Failed to save settings:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSource = async () => {
    try {
      if (!sourceForm.url) {
        showErrorToast('Source URL is required');
        return;
      }
      
      const response = await orbixNetworkAPI.addSource(sourceForm);
      setSources([...sources, response.data.source]);
      setShowAddSource(false);
      setSourceForm({ type: 'RSS', url: '', name: '' });
      success('Source added');
    } catch (error) {
      console.error('Failed to add source:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to add source');
    }
  };

  const handleUpdateSource = async (id, data) => {
    try {
      const response = await orbixNetworkAPI.updateSource(id, data);
      setSources(sources.map(s => s.id === id ? response.data.source : s));
      setEditingSource(null);
      success('Source updated');
    } catch (error) {
      console.error('Failed to update source:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to update source');
    }
  };

  const handleDeleteSource = async (id) => {
    try {
      if (!confirm('Are you sure you want to delete this source?')) {
        return;
      }
      
      await orbixNetworkAPI.deleteSource(id);
      setSources(sources.filter(s => s.id !== id));
      success('Source deleted');
    } catch (error) {
      console.error('Failed to delete source:', error);
      const errorInfo = handleAPIError(error);
      showErrorToast(errorInfo.message || 'Failed to delete source');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    // Parse date string (assume UTC if no timezone info)
    let date;
    if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
      // Already has timezone info
      date = new Date(dateString);
    } else {
      // Assume UTC if no timezone specified (database timestamps are typically UTC)
      date = new Date(dateString + 'Z');
    }
    // Convert to local timezone for display (browser's timezone)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <Link
                href="/dashboard/v2/modules/orbix-network/dashboard"
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold mb-2">Settings</h1>
              <p className="text-gray-600">Manage module configuration</p>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* Review Preferences */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Review Preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="review_mode_enabled"
                  checked={settings.review_mode_enabled}
                  onChange={(e) => setSettings({ ...settings, review_mode_enabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="review_mode_enabled" className="ml-2 text-gray-700">
                  Enable review mode (stories require approval before rendering)
                </label>
              </div>
              
              {settings.review_mode_enabled && (
                <div>
                  <label htmlFor="auto_approve_minutes" className="block text-sm font-medium text-gray-700 mb-2">
                    Auto-approve after (minutes)
                  </label>
                  <input
                    type="number"
                    id="auto_approve_minutes"
                    value={settings.auto_approve_minutes}
                    onChange={(e) => setSettings({ ...settings, auto_approve_minutes: parseInt(e.target.value) || 60 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    min="0"
                  />
                </div>
              )}
              
              <div>
                <label htmlFor="shock_score_threshold" className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum shock score threshold
                </label>
                <input
                  type="number"
                  id="shock_score_threshold"
                  value={settings.shock_score_threshold}
                  onChange={(e) => setSettings({ ...settings, shock_score_threshold: parseInt(e.target.value) || 65 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  min="0"
                  max="100"
                />
              </div>
            </div>
          </div>

          {/* Publishing Preferences */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Publishing Preferences</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="youtube_visibility" className="block text-sm font-medium text-gray-700 mb-2">
                  YouTube Visibility
                </label>
                <select
                  id="youtube_visibility"
                  value={settings.youtube_visibility}
                  onChange={(e) => setSettings({ ...settings, youtube_visibility: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enable_rumble"
                  checked={settings.enable_rumble}
                  onChange={(e) => setSettings({ ...settings, enable_rumble: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="enable_rumble" className="ml-2 text-gray-700">
                  Enable Rumble publishing (coming soon)
                </label>
              </div>
              
              <div>
                <label htmlFor="daily_video_cap" className="block text-sm font-medium text-gray-700 mb-2">
                  Daily video cap
                </label>
                <input
                  type="number"
                  id="daily_video_cap"
                  value={settings.daily_video_cap}
                  onChange={(e) => setSettings({ ...settings, daily_video_cap: parseInt(e.target.value) || 5 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  min="1"
                  max="50"
                />
              </div>
            </div>
          </div>

          {/* Background Preferences */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Background Preferences</h2>
            <div>
              <label htmlFor="background_random_mode" className="block text-sm font-medium text-gray-700 mb-2">
                Randomization Mode
              </label>
              <select
                id="background_random_mode"
                value={settings.background_random_mode}
                onChange={(e) => setSettings({ ...settings, background_random_mode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="uniform">Uniform (equal chance for all backgrounds)</option>
                <option value="weighted">Weighted (performance-based selection)</option>
              </select>
            </div>
          </div>

          {/* Source Management */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Source Management</h2>
              <button
                onClick={() => setShowAddSource(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Source
              </button>
            </div>
            
            {showAddSource && (
              <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Source Type</label>
                    <select
                      value={sourceForm.type}
                      onChange={(e) => setSourceForm({ ...sourceForm, type: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    >
                      <option value="RSS">RSS Feed</option>
                      <option value="HTML">HTML Scraper</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Source URL</label>
                    <input
                      type="text"
                      value={sourceForm.url}
                      onChange={(e) => setSourceForm({ ...sourceForm, url: e.target.value })}
                      placeholder="https://example.com/feed.xml"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Source Name (optional)</label>
                    <input
                      type="text"
                      value={sourceForm.name}
                      onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
                      placeholder="My News Source"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddSource}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Add Source
                    </button>
                    <button
                      onClick={() => {
                        setShowAddSource(false);
                        setSourceForm({ type: 'RSS', url: '', name: '' });
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-4">
              {sources.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No sources configured</p>
              ) : (
                sources.map((source) => (
                  <div key={source.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">{source.name || source.url}</span>
                          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            {source.type}
                          </span>
                          {source.enabled ? (
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Enabled</span>
                          ) : (
                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">Disabled</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{source.url}</p>
                        <p className="text-xs text-gray-500 mt-2">Added: {formatDate(source.created_at)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateSource(source.id, { enabled: !source.enabled })}
                          className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          {source.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDeleteSource(source.id)}
                          className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

